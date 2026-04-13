// utils/emailjs.ts
// Helper compartido para notificaciones por email via EmailJS
// PENDIENTE: reemplazar PENDING_CONFIG con credenciales reales de emailjs.com

const EMAILJS_SERVICE_ID = 'PENDING_CONFIG';
const EMAILJS_TEMPLATE_ID = 'PENDING_CONFIG';
const EMAILJS_PUBLIC_KEY = 'PENDING_CONFIG';
const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

export interface EmailParams {
  to_email: string;
  subject: string;
  message: string;
  from_name?: string;
}

export async function sendEmail(params: EmailParams): Promise<void> {
  try {
    const body = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: params.to_email,
        subject: params.subject,
        message: params.message,
        from_name: params.from_name ?? 'EstimaFácil',
      },
    };
    const res = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[EmailJS] Error enviando email:', res.status, await res.text());
    } else {
      console.log('[EmailJS] Email enviado a:', params.to_email);
    }
  } catch (e) {
    console.warn('[EmailJS] Excepción al enviar email:', e);
  }
}

// Correos predefinidos
export const ADMIN_EMAIL = 'arq.jorgeml@gmail.com';

export async function sendWelcomeEmail(userEmail: string, userName: string): Promise<void> {
  await sendEmail({
    to_email: userEmail,
    subject: 'Bienvenido a EstimaFácil®',
    message: `Hola ${userName},\n\nTu cuenta en EstimaFácil® ha sido creada exitosamente.\n\nYa puedes comenzar a gestionar tus estimaciones de obra.\n\n— El equipo de EstimaFácil®`,
    from_name: 'EstimaFácil®',
  });
}

export async function sendNewUserNotification(userEmail: string, userName: string): Promise<void> {
  await sendEmail({
    to_email: ADMIN_EMAIL,
    subject: 'Nuevo usuario registrado en EstimaFácil',
    message: `Nuevo usuario registrado:\n\nNombre: ${userName}\nEmail/ID: ${userEmail}\nFecha: ${new Date().toLocaleString('es-MX')}`,
    from_name: 'EstimaFácil Sistema',
  });
}

export async function sendCodeRedeemedNotification(userEmail: string, userName: string, planType: string): Promise<void> {
  await sendEmail({
    to_email: ADMIN_EMAIL,
    subject: 'Código canjeado en EstimaFácil',
    message: `Código canjeado:\n\nUsuario: ${userName}\nEmail/ID: ${userEmail}\nPlan: ${planType}\nFecha: ${new Date().toLocaleString('es-MX')}`,
    from_name: 'EstimaFácil Sistema',
  });
}
