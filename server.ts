import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = JSON.parse(
  readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8')
);

dotenv.config();

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId || undefined);

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

async function startServer() {
  const app = express();
  const port = process.env.PORT || 8080;

  // Paystack Webhook
  app.post('/api/paystack/webhook', express.json(), async (req, res) => {
    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET || '')
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;

    try {
      switch (event.event) {
        case 'subscription.create':
        case 'charge.success': {
          const data = event.data;
          const orgId = data.metadata?.orgId;
          const planId = data.metadata?.planId || 'pro'; // Fallback to pro if not found
          const customerCode = data.customer.customer_code;

          if (orgId) {
            await db.doc(`organisations/${orgId}`).update({
              paystackCustomerCode: customerCode,
              subscriptionStatus: 'active',
              subscriptionPlan: planId,
              trialEndDate: null
            });
          }
          break;
        }
        case 'invoice.payment_failed': {
          const data = event.data;
          const customerCode = data.customer.customer_code;

          const orgs = await db.collection('organisations')
            .where('paystackCustomerCode', '==', customerCode)
            .limit(1)
            .get();

          if (!orgs.empty) {
            await orgs.docs[0].ref.update({
              subscriptionStatus: 'past_due'
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
    }

    res.status(200).send('OK');
  });

  app.use(express.json());

  // Paystack API Routes
  app.post('/api/paystack/initialize', async (req, res) => {
    const { email, amount, planId, metadata } = req.body;

    let planCode = '';
    if (planId === 'basic') {
      planCode = process.env.PAYSTACK_BASIC_PLAN_CODE || '';
    } else if (planId === 'unlimited') {
      planCode = process.env.PAYSTACK_UNLIMITED_PLAN_CODE || '';
    }

    try {
      const response = await axios.post('https://api.paystack.co/transaction/initialize', {
        email,
        amount, 
        plan: planCode,
        metadata: {
          ...metadata,
          planId: planId
        },
        callback_url: `${req.headers.origin}/subscription?success=true`,
      }, {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        }
      });

      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.response?.data?.message || error.message });
    }
  });

  app.post('/api/create-portal-session', async (req, res) => {
    // Paystack doesn't have a direct equivalent to Stripe's Customer Portal
    // But we can redirect them to their dashboard or a custom page to manage cards
    // For now, we'll just return a placeholder or a link to Paystack's customer support
    res.json({ url: 'https://dashboard.paystack.com' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
