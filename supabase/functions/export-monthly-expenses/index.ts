// Export admin monthly summary as CSV or JSON.
// Route: /functions/v1/export-monthly-expenses?month=YYYY-MM&format=csv|json

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition, X-Report-Month, X-Report-Rows",
};

const mileageScale = {
  3: { upTo5000: 0.529, midRate: 0.316, midFixed: 1065, over20000: 0.37 },
  4: { upTo5000: 0.606, midRate: 0.34, midFixed: 1330, over20000: 0.407 },
  5: { upTo5000: 0.636, midRate: 0.357, midFixed: 1395, over20000: 0.427 },
  6: { upTo5000: 0.665, midRate: 0.374, midFixed: 1457, over20000: 0.447 },
  7: { upTo5000: 0.697, midRate: 0.394, midFixed: 1515, over20000: 0.47 },
} as const;

function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function parseFiscalPower(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getMileageScaleBand(fiscalPower: unknown) {
  const parsed = parseFiscalPower(fiscalPower);
  if (!parsed) return null;
  if (parsed <= 3) return 3;
  if (parsed >= 7) return 7;
  return parsed as 4 | 5 | 6;
}

function calculateAnnualMileageAmount(distanceKm: number, fiscalPower: unknown) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const band = getMileageScaleBand(fiscalPower);
  if (!distance || !band) return 0;

  const scale = mileageScale[band];
  if (distance <= 5000) return distance * scale.upTo5000;
  if (distance <= 20000) return distance * scale.midRate + scale.midFixed;
  return distance * scale.over20000;
}

function roundCurrency(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function escapeCsv(value: unknown) {
  const normalized = String(value ?? "");
  if (/[",\n;]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function buildCoachName(user: Record<string, unknown>) {
  return [user.name, user.first_name].filter(Boolean).join(" ").trim() || String(user.email || user.id || "Profil inconnu");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const requestedMonth = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(requestedMonth)) {
    return jsonResponse({ error: "Invalid month. Expected YYYY-MM." }, 400);
  }

  if (format !== "csv" && format !== "json") {
    return jsonResponse({ error: "Invalid format. Expected csv or json." }, 400);
  }

  const yearStart = `${requestedMonth.slice(0, 4)}-01-01`;
  const yearEnd = `${requestedMonth.slice(0, 4)}-12-31`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin").single();
  if (adminError || !isAdmin) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  try {
    const { data: yearRows, error: yearRowsError } = await supabase
      .from("time_data")
      .select("coach_id, date, hours, competition, km")
      .gte("date", yearStart)
      .lte("date", yearEnd)
      .order("date", { ascending: true });

    if (yearRowsError) throw yearRowsError;

    const monthRows = (yearRows || []).filter((row) => String(row.date || "").startsWith(requestedMonth));
    const coachIds = [...new Set(monthRows.map((row) => row.coach_id).filter(Boolean))];

    if (!coachIds.length) {
      const emptyPayload = {
        month: requestedMonth,
        generated_at: new Date().toISOString(),
        totals: {
          coaches: 0,
          total_hours: 0,
          competition_days: 0,
          paid_salary_amount: 0,
          total_km: 0,
          mileage_amount: 0,
          total_amount: 0,
        },
        rows: [],
      };

      if (format === "csv") {
        const header = "Mois,Profil,Type,Heures,Competitions,Taux horaire (€),Indemnite competition (€),Salaire heures (€),Salaire competitions (€),Salaire total (€),KM,Mileage (€),Total (€)";
        return new Response(header + "\n", {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename=admin_monthly_summary_${requestedMonth}.csv`,
            "X-Report-Month": requestedMonth,
            "X-Report-Rows": "0",
          },
        });
      }

      return jsonResponse(emptyPayload, 200, {
        "X-Report-Month": requestedMonth,
        "X-Report-Rows": "0",
      });
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, name, first_name, email, profile_type, hourly_rate, daily_allowance, km_rate, fiscal_power")
      .in("id", coachIds);

    if (usersError) throw usersError;

    const usersById = new Map((users || []).map((user) => [user.id, user]));
    const rowsByCoach = new Map<string, Array<Record<string, unknown>>>();
    for (const row of yearRows || []) {
      const coachId = String(row.coach_id || "");
      if (!usersById.has(coachId)) continue;
      const bucket = rowsByCoach.get(coachId) || [];
      bucket.push(row as Record<string, unknown>);
      rowsByCoach.set(coachId, bucket);
    }

    const summaryRows = coachIds
      .map((coachId) => {
        const user = usersById.get(coachId);
        if (!user) return null;

        const coachRows = rowsByCoach.get(coachId) || [];
        const hourlyRate = Number(user.hourly_rate) || 0;
        const dailyAllowance = Number(user.daily_allowance) || 0;
        const fallbackKmRate = Number(user.km_rate) || 0;
        const fiscalPower = user.fiscal_power;

        let cumulativeKm = 0;
        let totalHours = 0;
        let competitionDays = 0;
        let totalKm = 0;
        let mileageAmount = 0;

        coachRows.forEach((row) => {
          const rowKm = Math.max(0, Number(row.km) || 0);
          const previousKm = cumulativeKm;
          cumulativeKm += rowKm;

          const rowMileageAmount = getMileageScaleBand(fiscalPower)
            ? calculateAnnualMileageAmount(cumulativeKm, fiscalPower) - calculateAnnualMileageAmount(previousKm, fiscalPower)
            : rowKm * fallbackKmRate;

          if (!String(row.date || "").startsWith(requestedMonth)) return;

          totalHours += Math.max(0, Number(row.hours) || 0);
          if (row.competition === true) competitionDays += 1;
          totalKm += rowKm;
          mileageAmount += rowMileageAmount;
        });

        const salaryAmount = totalHours * hourlyRate;
        const competitionAmount = competitionDays * dailyAllowance;
        const paidSalaryAmount = salaryAmount + competitionAmount;
        const totalAmount = paidSalaryAmount + mileageAmount;

        return {
          month: requestedMonth,
          coach_id: coachId,
          coach_name: buildCoachName(user),
          profile_type: String(user.profile_type || "coach"),
          total_hours: roundCurrency(totalHours),
          competition_days: competitionDays,
          hourly_rate: roundCurrency(hourlyRate),
          daily_allowance: roundCurrency(dailyAllowance),
          salary_amount: roundCurrency(salaryAmount),
          competition_amount: roundCurrency(competitionAmount),
          paid_salary_amount: roundCurrency(paidSalaryAmount),
          total_km: roundCurrency(totalKm),
          mileage_amount: roundCurrency(mileageAmount),
          total_amount: roundCurrency(totalAmount),
        };
      })
      .filter((row) => row && (row.total_hours > 0 || row.competition_days > 0 || row.total_km > 0))
      .sort((left, right) => right.total_amount - left.total_amount);

    const totals = summaryRows.reduce((acc, row) => ({
      coaches: acc.coaches + 1,
      total_hours: roundCurrency(acc.total_hours + row.total_hours),
      competition_days: acc.competition_days + row.competition_days,
      paid_salary_amount: roundCurrency(acc.paid_salary_amount + row.paid_salary_amount),
      total_km: roundCurrency(acc.total_km + row.total_km),
      mileage_amount: roundCurrency(acc.mileage_amount + row.mileage_amount),
      total_amount: roundCurrency(acc.total_amount + row.total_amount),
    }), {
      coaches: 0,
      total_hours: 0,
      competition_days: 0,
      paid_salary_amount: 0,
      total_km: 0,
      mileage_amount: 0,
      total_amount: 0,
    });

    const headerValues = {
      "X-Report-Month": requestedMonth,
      "X-Report-Rows": String(summaryRows.length),
    };

    if (format === "csv") {
      const header = "Mois,Profil,Type,Heures,Competitions,Taux horaire (€),Indemnite competition (€),Salaire heures (€),Salaire competitions (€),Salaire total (€),KM,Mileage (€),Total (€)";
      const body = summaryRows.map((row) => [
        row.month,
        row.coach_name,
        row.profile_type,
        row.total_hours,
        row.competition_days,
        row.hourly_rate,
        row.daily_allowance,
        row.salary_amount,
        row.competition_amount,
        row.paid_salary_amount,
        row.total_km,
        row.mileage_amount,
        row.total_amount,
      ].map(escapeCsv).join(",")).join("\n");

      return new Response([header, body].filter(Boolean).join("\n"), {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=admin_monthly_summary_${requestedMonth}.csv`,
          ...headerValues,
        },
      });
    }

    return jsonResponse({
      month: requestedMonth,
      generated_at: new Date().toISOString(),
      totals,
      rows: summaryRows,
    }, 200, headerValues);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});