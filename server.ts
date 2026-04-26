import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// FIX 1: Use Environment Variables instead of reading a local file
// This stops the "Health Check Timeout" crash
const projectId = process.env.FIREBASE_PROJECT_ID || 'your-actual-project-id';

if (!getApps().length) {
  initializeApp({
    projectId: projectId,
  });
}

const db = getFirestore();
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

async function startServer() {
  const app = express();
  // FIX 2: Ensure PORT is capitalized to match what Firebase provides
  const port = process.env.PORT || 8080;

  app.use(express.json());

  // FIX 3: Add a basic Health Check so Firebase sees the app is "Alive"
  app.get('/', (req, res) => {
    res.send('FieldPay Backend is Online');
  });

  // Paystack Webhook
  app.post('/api/paystack/webhook', async (req, res) => {
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
          const planId = data.metadata?.planId || 'pro';
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
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
    }
    res.status(200).send('OK');
  });

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
        metadata: { ...metadata, planId: planId },
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

  // FIX 4: Only one listen call at the very end
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
  });
}

startServer();