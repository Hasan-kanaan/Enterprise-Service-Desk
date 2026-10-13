type SecurityEmailContent = {
  heading: string;
  introduction: string;
  guidance: string;
  reason: string;
  action?: { label: string; link: string; expiry: string };
};

// Every value is plain text; this module never accepts caller-supplied HTML.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function securityEmail(content: SecurityEmailContent) {
  const { heading, introduction, guidance, reason, action } = content;
  if (action) {
    // Defense in depth at the rendering boundary, without logging the URL.
    let url: URL;
    try {
      url = new URL(action.link);
    } catch {
      throw new Error('Invalid account email URL');
    }
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Invalid account email URL');
  }
  const text = [
    'Kino Service Desk',
    heading,
    introduction,
    ...(action ? [action.expiry, `${action.label}:\n${action.link}`] : []),
    guidance,
    reason,
  ].join('\n\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f1f5f7;color:#17212b;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #d7e0e6;border-radius:12px;">
<tr><td style="padding:24px;border-bottom:1px solid #d7e0e6;color:#155e75;font-size:18px;font-weight:bold;">Kino Service Desk</td></tr>
<tr><td style="padding:28px 24px;font-size:16px;line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#17212b;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 20px;">${escapeHtml(introduction)}</p>
${
  action
    ? `<p style="margin:0 0 20px;color:#566575;">${escapeHtml(action.expiry)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#155e75" style="border-radius:6px;text-align:center;"><a href="${escapeHtml(action.link)}" style="display:inline-block;padding:14px 24px;border:1px solid #155e75;border-radius:6px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHtml(action.label)}</a></td></tr></table>
<p style="margin:24px 0 8px;font-size:13px;color:#566575;">If the button does not work, copy and paste this link into your browser:</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all;overflow-wrap:anywhere;"><a href="${escapeHtml(action.link)}" style="color:#155e75;text-decoration:underline;word-break:break-all;">${escapeHtml(action.link)}</a></p>`
    : ''
}
<p style="margin:0;padding-top:20px;border-top:1px solid #d7e0e6;">${escapeHtml(guidance)}</p>
</td></tr>
<tr><td style="padding:20px 24px;background-color:#f8fafb;border-top:1px solid #d7e0e6;font-size:12px;line-height:1.6;color:#566575;">${escapeHtml(reason)}<br>Kino Service Desk · Account security</td></tr>
</table></td></tr></table>
</body></html>`;
  return { text, html };
}

export function accountActivationEmail(link: string) {
  return securityEmail({
    heading: 'Activate your account',
    introduction:
      'A Kino Service Desk account has been created for this email address. Verify your address and choose your own password to get started.',
    action: {
      label: 'Activate account',
      link,
      expiry: 'This single-use activation link expires in 24 hours.',
    },
    guidance:
      'If you did not expect this account, ignore this email or contact company IT/security.',
    reason:
      'You received this email because a Kino Service Desk account was created for this address.',
  });
}

export function passwordResetEmail(link: string) {
  return securityEmail({
    heading: 'Reset your password',
    introduction:
      'A password reset was requested for your Kino Service Desk account. Use the link below to choose a new password.',
    action: {
      label: 'Reset password',
      link,
      expiry: 'This single-use reset link expires in 30 minutes.',
    },
    guidance:
      'If you did not request this reset, you may ignore this email. Your password has not been changed by this request.',
    reason:
      'You received this email because a password reset was requested for your Kino Service Desk account.',
  });
}

export function passwordChangedEmail() {
  return securityEmail({
    heading: 'Your password was changed',
    introduction:
      'Your Kino Service Desk password was changed. If you made this change, no further action is required.',
    guidance:
      'If you did not make this change, contact company IT/security immediately.',
    reason:
      'You received this security notice because the password for your Kino Service Desk account was changed.',
  });
}
