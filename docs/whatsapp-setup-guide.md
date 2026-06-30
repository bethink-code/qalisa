# Setting Up WhatsApp Cloud API for Qalisa

This guide walks you through connecting your Meta WhatsApp Business Account to Qalisa. The setup involves four separate Meta platforms and the order of steps matters — skipping ahead causes hard-to-diagnose errors.

**Platforms you'll visit:**
- [business.facebook.com](https://business.facebook.com) — Business Portfolio (asset and user management)
- [business.facebook.com/wa/manage](https://business.facebook.com/wa/manage) — WhatsApp Manager (phone numbers)
- [developers.facebook.com](https://developers.facebook.com) — Meta for Developers (app settings, webhooks)
- Qalisa Credentials page — final step

---

## Before You Start

You need:
- A Meta **Business Portfolio** (verified business)
- A **WhatsApp Business Account (WABA)** attached to that portfolio with status **Approved**
- A **Meta App** of type **Business** created in your portfolio (e.g. "Acme Communications")
- A connected phone number with status **Connected**

---

## Step 1 — Collect Your IDs

You need three IDs before doing anything else. Collect them first.

### 1a. WABA ID
1. Go to [business.facebook.com](https://business.facebook.com) → **Settings**
2. Left sidebar → **Accounts → WhatsApp accounts**
3. Click your WhatsApp Business Account
4. The **ID** is shown in blue under the account name (e.g. `576087568916366`)

### 1b. Phone Number ID
1. From the WhatsApp account detail, click **WhatsApp Manager** (bottom of the panel)
2. Left sidebar → **Account tools → Phone numbers**
3. Click the **gear icon** next to your phone number
4. The **Phone number ID** is shown in blue under the phone number (e.g. `506496185889279`)

### 1c. App Secret
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Select your Meta app (e.g. "Bethink Communications") from the top dropdown
3. Left sidebar → **App settings → Basic**
4. Click **Show** next to **App secret** and copy the value

---

## Step 2 — Create a System User

A system user is a non-human API identity. It holds the access token Qalisa uses to send messages.

1. Go to [business.facebook.com](https://business.facebook.com) → **Settings**
2. Left sidebar → **Users → System users**
3. Click **+ Add**
4. Name it something like `qalisa` or `your-brand-comms`
5. Role: **Employee** (not Admin — Employee is sufficient and safer)
6. Click **Create system user**

---

## Step 3 — Assign Assets to the System User

**This step has a strict order. Both assets must be assigned before generating a token, and the WhatsApp account must be assigned before the App.**

### 3a. Assign the WhatsApp account
1. On the system user panel, click **Assign assets**
2. Left column: select **WhatsApp accounts**
3. Tick your WhatsApp Business Account
4. Right column — tick ONLY these permissions (do not tick "Everything" — this can trigger an account block):
   - **Message templates (view and manage)**
   - **Messages**
   - **Phone numbers (view only)**
   - **Manage phone numbers and message templates**
5. Click **Assign assets**

### 3b. Assign the App
1. Click **Assign assets** again
2. Left column: select **Apps**
3. Tick your Meta app (e.g. "Bethink Communications")
4. Right column: tick **Manage app** (Full access)
5. Click **Assign assets**

> **Why this matters:** Assigning the App as an asset automatically registers the system user as an Administrator in the app's role list. This is what unlocks the permissions dropdown in Step 4. Without it, token generation shows "No permissions available" with no clear explanation.

> **What does NOT work:** Trying to add the system user via Meta for Developers → App roles → Add People gives the error "users haven't registered their developer accounts." System users cannot be added that way — ignore that path entirely.

---

## Step 4 — Generate the Access Token

1. Back on the system user page, click **Generate token**
2. **Select app**: choose your Meta app
3. Click **Next**
4. **Token expiry**: select **Never** (system user tokens can be permanent — you don't want this to expire and silently break your sending)
5. Click **Next**
6. **Assign permissions** — open the dropdown and tick all three:
   - `whatsapp_business_manage_events`
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
7. Click **Generate token**
8. **Copy the token immediately** — it is shown exactly once. Store it in a password manager or secrets vault.

---

## Step 5 — Add the Credential in Qalisa

1. Go to your Qalisa app → **Credentials**
2. Click **Add** → select **Meta Cloud API (WhatsApp)**
3. Fill in the fields:

| Field | Value |
|---|---|
| WhatsApp Business Account ID | Your WABA ID from Step 1a |
| Phone Number ID | Your Phone Number ID from Step 1b |
| App Secret | Your App Secret from Step 1c |
| Webhook Verify Token | Any secret string you choose (e.g. `mycompany_wh_2026`) — you will enter this same value in Step 6 |
| System User Access Token | The token from Step 4 |

4. Click **Save**
5. The credential should show **healthy** and confirm your phone number as verified

> If it shows unhealthy, double-check the WABA ID, Phone Number ID, and access token. A common mistake is using the phone number itself instead of the Phone Number ID.

After saving, Qalisa shows your **Webhook URL** — copy it for the next step.

---

## Step 6 — Configure the Webhook in Meta

1. Go to [developers.facebook.com](https://developers.facebook.com) → your app
2. Left sidebar → **WhatsApp → Configuration**
3. Under **Webhooks**, click **Edit**
4. Fill in:
   - **Callback URL**: the webhook URL copied from Qalisa (looks like `https://api.yourdomain.com/v1/webhooks/meta/your-tenant-id`)
   - **Verify token**: the exact string you used as Webhook Verify Token in Step 5
5. Click **Verify and save**
6. Once verified, scroll down to **Webhook fields** and subscribe to:
   - `messages` — for delivery receipts
   - `message_template_status_update` — for template approval notifications

---

## Step 7 — Publish the App

> **Critical:** While your app is in Development mode, Meta only sends test webhooks from the dashboard. No real delivery receipts or status updates will reach Qalisa until the app is Live.

1. In Meta for Developers → your app, find the **App Mode** toggle at the top of the page
2. Toggle from **Development** to **Live**
3. If prompted, you need:
   - Privacy Policy URL (a public page on your website)
   - Terms of Service URL
   - App icon (1024×1024px)
   - Contact email

Once Live, real webhook events will fire and Qalisa will receive delivery receipts.

---

## Summary Checklist

- [ ] WABA ID collected
- [ ] Phone Number ID collected
- [ ] App Secret collected
- [ ] System user created (Employee role)
- [ ] WhatsApp account asset assigned (with specific partial permissions, NOT Everything)
- [ ] App asset assigned (full access / Manage app)
- [ ] Token generated with 3 permissions (never expiring)
- [ ] Credential added in Qalisa (shows healthy)
- [ ] Webhook URL copied from Qalisa
- [ ] Webhook configured in Meta for Developers
- [ ] `messages` and `message_template_status_update` fields subscribed
- [ ] App toggled to Live

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| "No permissions available" when generating token | App not assigned as asset to system user | Complete Step 3b before generating the token |
| "Form can't be saved / users haven't registered developer accounts" | Trying to add system user via App roles in Meta for Developers | Use Business Manager → Apps → Assign people instead (Step 3b) |
| Credential shows unhealthy | Wrong WABA ID, Phone Number ID, or token | Double-check Step 1 values; WABA ID ≠ Business ID |
| Webhooks not firing in production | App is still in Development mode | Complete Step 7 |
| Delivery receipts working in test but not real traffic | Same as above | Complete Step 7 |
