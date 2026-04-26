import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending invitations
  app.post("/api/send-invite", async (req, res) => {
    const { email, inviteLink, organisationName, role } = req.body;

    if (!email || !inviteLink) {
      return res.status(400).json({ error: "Email and invite link are required" });
    }

    // Check for SMTP credentials
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log("SMTP credentials not found. Logging email to console instead.");
      console.log(`
        To: ${email}
        Subject: Invitation to join ${organisationName} on PaY Flow
        Body:
        Hi there,
        
        You have been invited to join ${organisationName} as a ${role} on PaY Flow.
        
        Please click the link below to set up your account and password:
        ${inviteLink}
        
        Best regards,
        The PaY Flow Team
      `);
      return res.json({ 
        success: true, 
        message: "Email logged to console (SMTP not configured).",
        isMock: true 
      });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        // Better defaults for reliability
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      // Log the attempt
      console.log(`Attempting to send email to ${email} via ${smtpHost}:${smtpPort}`);

      await transporter.sendMail({
        from: `"PaY Flow" <${smtpUser}>`,
        to: email,
        subject: `Invitation to join ${organisationName} on PaY Flow`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #2563eb; margin: 0;">PaY Flow</h1>
            </div>
            <h2 style="color: #1e293b;">Invitation to join ${organisationName}</h2>
            <p style="color: #475569; font-size: 16px;">Hi there,</p>
            <p style="color: #475569; font-size: 16px;">You have been invited to join <strong>${organisationName}</strong> as a <strong>${role}</strong> on PaY Flow.</p>
            <p style="color: #475569; font-size: 16px;">Please click the button below to set up your account and complete your profile:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteLink}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Set Up Account</a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">If the button doesn't work, copy and paste this link into your browser:<br/>
            <span style="color: #2563eb;">${inviteLink}</span></p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
            <p style="color: #94a3b8; font-size: 12px;">This invitation was sent automatically by PaY Flow on behalf of ${organisationName}.</p>
          </div>
        `,
      });

      console.log(`Email sent successfully to ${email}`);
      res.json({ success: true, message: "Email sent successfully" });
    } catch (error: any) {
      console.error("Nodemailer Error:", error);
      res.status(500).json({ 
        error: "Failed to send email", 
        details: error.message,
        code: error.code
      });
    }
  });

  // Paystack Billing API Routes
  app.post("/api/billing/manage-portal", async (req, res) => {
    const { customerEmail, subscriptionCode } = req.body;
    
    // In a real implementation, you would call Paystack to get a management link
    // Paystack doesn't have a dynamic 'session' URL like Stripe, but they have
    // hosted pages for subscription management.
    // We'll simulate returning a secure link.
    
    if (!customerEmail) {
      return res.status(400).json({ error: "Customer email is required" });
    }

    try {
      // Simulate API call to Paystack
      // const response = await fetch('https://api.paystack.co/subscription/manage/' + subscriptionCode, { ... });
      
      // For demo purposes, we return a simulated portal URL
      // In reality, this might be a link to a custom page or a Paystack hosted URL
      const portalUrl = `https://checkout.paystack.com/manage/${subscriptionCode || 'demo_sub_code'}`;
      
      res.json({ url: portalUrl });
    } catch (error) {
      console.error("Failed to generate portal link:", error);
      res.status(500).json({ error: "Failed to generate portal link" });
    }
  });

  app.post("/api/billing/cancel-subscription", async (req, res) => {
    const { subscriptionCode, email } = req.body;
    
    if (!subscriptionCode) {
      return res.status(400).json({ error: "Subscription code is required" });
    }

    try {
      // Simulate Paystack API call to disable subscription at period end
      // await fetch('https://api.paystack.co/subscription/disable', { 
      //   method: 'POST', 
      //   body: JSON.stringify({ code: subscriptionCode, token: token }) 
      // });
      
      console.log(`Cancelling subscription ${subscriptionCode} for ${email}`);
      
      res.json({ 
        success: true, 
        message: "Subscription set to cancel at period end.",
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Simulate 30 days from now
      });
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  app.post("/api/billing/webhook", async (req, res) => {
    // Paystack Webhook Handler
    const event = req.body;
    
    // Validate Paystack Signature (Implementation detail in production)
    // const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');
    // if (hash !== req.headers['x-paystack-signature']) return res.status(401).send();

    console.log("Received Paystack Webhook:", event.event);

    // Update Firestore based on event
    // This would typically use the Firebase Admin SDK
    // Since we are running in a sandbox, we'll log the intention
    
    switch (event.event) {
      case 'subscription.create':
      case 'charge.success':
        console.log("Updating organisation to ACTIVE status...");
        break;
      case 'subscription.disable':
        console.log("Updating organisation to CANCELLED status...");
        break;
      case 'invoice.payment_failed':
        console.log("Updating organisation to UNPAID/RESTRICTED status...");
        break;
    }

    res.status(200).send('Webhook Received');
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // This allows Firebase to set the port dynamically
const port = process.env.port || 8080;

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
});
}

startServer();
