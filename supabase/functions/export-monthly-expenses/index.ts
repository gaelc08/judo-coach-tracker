// Export monthly expenses as CSV or JSON
// Route: /functions/v1/export-monthly-expenses?format=csv|json

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Check auth
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get format (csv or json)
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "json";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  // Check if user is admin
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin, error: adminError } = await supabase
    .rpc("is_admin")
    .single();

  if (adminError || !isAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (format === "csv") {
      // Call CSV export function
      const { data: csv, error } = await supabase
        .rpc("export_monthly_expenses_csv")
        .single();

      if (error) throw error;

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=monthly_expenses_" + new Date().toISOString().split("T")[0] + ".csv",
        },
      });
    } else {
      // Call JSON export function
      const { data: json, error } = await supabase
        .rpc("export_monthly_expenses_json")
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(json, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});