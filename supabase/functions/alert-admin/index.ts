import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { coachName, date, data } = await req.json()
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'admin@example.com'

    if (!resendKey) {
      console.warn('RESEND_API_KEY is not configured. Skipping email alert.')
      return jsonResponse({ message: 'No Resend key configured' }, 200)
    }

    const htmlContent = `
      <h3>Modification par ${coachName}</h3>
      <p>La date <strong>${date}</strong> a été modifiée.</p>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Judo Coach <onboarding@resend.dev>',
        to: adminEmail,
        subject: `Judo Coach : Modification de saisie par ${coachName}`,
        html: htmlContent,
      }),
    })

    const resendData = await res.json()

    return jsonResponse({ success: true, resendData }, 200)
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500)
  }
})
