# Membership Portal

Membership website for the Society. Visitors join online (email OTP, form, online
payment); the system issues a membership number, a two-sided PDF ID card with a QR
code and a payment receipt, emails them, expires memberships automatically, reminds
members to renew, and lets members log in to download their card and renew online.
The admin can also register members by hand, record offline payments and refunds.

Stack: Node.js + Express + MongoDB (Mongoose) backend, React + Vite + Tailwind frontend.

## Folder structure

```
backend/
  server.js        starts the API (and serves the built frontend in production)
  config/          db.js, membership.js (types, fees, validity), content.js (website text)
  auth/            admin login, email codes (OTP), member/applicant sessions
  join/            public sign-up: OTP -> application -> payment
  account/         member account: login by email code, card, receipts, renew online
  admin/           admin API for applications, payments, refunds, dashboard numbers
  members/         member model, membership number, validation, admin member API
  payments/        orders, activation after payment, gateway connection point
    providers/     test.js (fake payments), zoho.js (to be connected)
  idcard/          ID card PDF (front + back with QR) and receipt PDF
  mail/            all emails, in the Society's email format
  documents/       file uploads (photo, signature, ID proofs) — stored privately
  public/          public members list, QR verification, settings for the frontend
  expiry/          nightly job: expire, remind, clean up unpaid applications
  shared/          date helpers
  uploads/         uploaded files (created automatically, never public)

frontend/src/
  api/             server calls, settings from the backend
  public/          home page, plans, members directory, QR verification page
  join/            "Become a member" steps
  account/         member login and account page
  payments/        Checkout (test buttons / Zoho widget) — zoho.js to be connected
  admin/           dashboard, applications, payments
  members/         admin member list, add/edit form, member detail, renew, status
  auth/            admin login, change password
  layout/          public site and admin panel frames
  ui/              shared pieces (form fields, badges, icons, code form)
  shared/          formatting, form helpers, list of Indian states
```

## Running locally

Needs Node.js 20+ and MongoDB.

```bash
# 1. Backend (port 5002)
cd backend
npm install
copy .env.example .env        # then edit .env
npm run create-admin -- admin <password>
npm run dev

# 2. Frontend (port 5174), in a second terminal
cd frontend
npm install
npm run dev
```

- http://localhost:5174 — public website (home, join, members directory, member login)
- http://localhost:5174/admin — admin panel

To try the whole join flow without a gateway, set `PAYMENT_PROVIDER=test` in `backend/.env`:
the payment step then shows "Simulate successful / failed payment" buttons.
Without SMTP settings, emails (including the 6-digit codes) are printed in the backend
console. `EMAIL_MODE=file` also saves every email and its PDFs in `backend/email-previews`.

## How it works

**Joining online** (`/join`)
1. Choose a plan (Student, Annual, Life, Institutional).
2. Enter email → duplicate check (existing members are sent to member login) → 6-digit code.
3. Fill the form (same fields as MEMBERSHIP FORM.docx), upload documents, accept the terms.
   This is saved as a **pending application**.
4. Pay online. Only when the gateway confirms the payment (to the server, not just the browser)
   is the member created: membership number, Active status, ID card and receipt emailed.
5. If the payment fails, the application stays pending for 30 days. Verifying the same email
   again goes straight to payment — no need to fill the form again. An email with a link is sent.

**Member account** (`/account`) — log in with a code sent to the registered email (no password).
Download ID card and receipts, update WhatsApp/address/affiliation/directory consent, and renew
online from 60 days before expiry (or after expiry).

**Admin** (`/admin`)
- Dashboard: member counts, applications waiting for payment, online payments this month.
- Members: list, add (with first payment), edit, renew (record payment), make inactive / reinstate,
  ID card, receipts, CSV export.
- Applications: online sign-ups. If someone paid offline, "Record payment and register" makes them
  a member. Applications can be cancelled (documents are deleted).
- Payments: every online payment. "Check status with gateway" for payments stuck in progress;
  "Record a refund" after refunding in the gateway dashboard (optionally makes the membership inactive).

**Numbers**: membership `ASSSR-2026-000001`, receipt `ASSSR/R/2026/000001`, online order `ASSSR-ORD-000001`.

**Validity**: Student, Annual and Institutional last 12 months from joining (1 Apr 2026 → 31 Mar 2027).
Life never expires. A renewal while still valid starts the day after the current expiry;
after expiry it starts from the payment date.

**Statuses**: Active → Expired automatically at midnight (IST). Admin can make a member Inactive
and reinstate them. Reminders are emailed 30 and 7 days before expiry.

**Public list**: only members who consented; name, membership ID, type, status, date of joining.

## Connecting Zoho Payments

The gateway is isolated in two files; nothing else needs to change.

1. `backend/payments/providers/zoho.js` — `problem()`, `createCheckout()`, `verifyPayment()`,
   `parseWebhook()`. The file lists the Zoho API endpoints and suggested `.env` keys.
2. `frontend/src/payments/zoho.js` — `payWithZoho(checkout)` opens the Zoho widget and returns
   `{ payment_id }`.
3. Allow the Zoho script and frames in the Content-Security-Policy in `backend/server.js`.
4. In Zoho, point the webhook (`payment.succeeded`, `payment.failed`) to
   `https://<your domain>/api/payments/webhook/zoho`.
5. Set `PAYMENT_PROVIDER=zoho`.

`payments/service.js` already handles everything after "paid": member creation, receipts,
emails, duplicate payments (flagged under Payments → Needs attention).

## Settings

- **Types, fees, validity, renewal window**: `backend/config/membership.js`
- **Website text (about, benefits, terms)**: `backend/config/content.js`
- **Organization, contact, social links, email images**: `backend/.env` (see `.env.example`)
- **Public URL**: `FRONTEND_URL` — used in the QR code on ID cards; set it before issuing cards.

To reset the admin password: `npm run create-admin -- admin <new password>`.

## Production

```bash
cd frontend && npm run build      # creates frontend/dist
cd ../backend && npm start        # serves the API and frontend/dist on PORT
```

Run it behind nginx with HTTPS, set `TRUST_PROXY=1`, `NODE_ENV=production` and the real
`FRONTEND_URL`, then re-enable `upgrade-insecure-requests` in `server.js`. Test payments are
refused when `NODE_ENV=production`. Back up both the MongoDB database and `backend/uploads`.
