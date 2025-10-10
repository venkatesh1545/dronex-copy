// @deno-types="https://deno.land/std@0.190.0/http/server.ts"
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function findUserByEmail(adminClient: any, email: string) {
  try {
    let page = 1;
    const perPage = 200;
    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const found = data.users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (found) return found;
      if (page >= (data.lastPage || page)) break;
      page++;
    }
    return null;
  } catch (e) {
    console.error('findUserByEmail error:', e);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, name, verificationCode } = await req.json();

    if (!to || !verificationCode) {
      return new Response(JSON.stringify({ success: false, error: 'Missing to or verificationCode' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Admin client to check if an account already exists for the recipient email
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const existingUser = await findUserByEmail(admin, to);
    const accountExists = !!existingUser;

    const subject = accountExists
      ? 'DroneX Contact Verification Code'
      : 'Create your DroneX account to verify (includes OTP)';

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial; line-height: 1.6; color: #111;">
        <h2 style="margin: 0 0 12px;">Hello${name ? ` ${name}` : ''},</h2>
        ${accountExists
          ? `<p>Use the One-Time Password (OTP) below to verify your emergency contact link:</p>`
          : `<p>To complete the verification and group chat, you must needs to sign up. Here's your OTP <strong>${verificationCode}</strong>.</p>`
        }
        <div style="margin: 16px 0; padding: 16px; background: #f7f7f8; border-radius: 8px; border: 1px solid #eee; text-align: center;">
          <div style="font-size: 12px; color: #666; letter-spacing: 0.08em; text-transform: uppercase;">Your verification code</div>
          <div style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em; margin-top: 6px;">${verificationCode}</div>
        </div>
        ${accountExists
          ? ''
          : `<p style=\"margin: 12px 0 0;\">After creating your account, return to the app and enter the code to complete verification.</p>`
        }
        <p style="font-size: 12px; color: #666;">This code expires in 30 minutes. If you didn’t request this, you can ignore this message.</p>
        <p style="margin-top: 16px; color: #444;">— DroneX Team</p>
      </div>
    `;

    try {
      const { data: sendData, error: sendError } = await resend.emails.send({
        from: 'DroneX <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      });

      if (sendError) {
        throw sendError;
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Verification email sent successfully', emailSent: true, emailId: sendData?.id, accountExists }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (sendErr: any) {
      const msg = String(sendErr?.message || '');
      const status = (sendErr as any)?.statusCode || (sendErr as any)?.status || 500;
      const isDomainRestriction = status === 403 || msg.toLowerCase().includes('verify a domain') || msg.toLowerCase().includes('testing emails');
      if (isDomainRestriction) {
        console.warn('Resend domain restriction encountered. Returning devFallback with OTP.');
        return new Response(
          JSON.stringify({
            success: true,
            emailSent: false,
            accountExists,
            devFallback: true,
            verificationCode,
            message: 'Email blocked by provider (domain not verified). OTP returned for testing.'
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 200 }
        );
      }
      throw sendErr;
    }
  } catch (error: any) {
    console.error('Email sending error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message, emailSent: false }),
      { headers: { "Content-Type": "application/json", ...corsHeaders }, status: 500 }
    );
  }
});
