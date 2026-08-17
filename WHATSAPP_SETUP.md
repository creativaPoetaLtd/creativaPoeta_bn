# Creativa Poeta WhatsApp team inbox

The dashboard integration uses the official Meta WhatsApp Business Cloud API. It does not scrape WhatsApp Web and does not require a team member's personal phone session.

## Current target mode

Creativa Poeta will use its existing business number exclusively through Cloud API and the Creativa Poeta dashboard. The WhatsApp Business mobile account must remain active until the test webhook, permanent access and dashboard reply flow have all been validated. The final account deletion and number registration are performed only during the planned cutover.

## 1. Meta prerequisites

1. Open [Meta for Developers](https://developers.facebook.com/apps/).
2. Create or select the Creativa Poeta business app.
3. Add the **WhatsApp** product and connect the Creativa Poeta WhatsApp Business Account.
4. Add the production phone number. Complete the display-name review when Meta requests it.
5. Generate a permanent system-user access token with the WhatsApp permissions required by Meta. Do not use the temporary test token in production.

Official references:

- [Cloud API setup](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Sending messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)

## 2. Backend environment variables

Add these values to the backend Vercel project. Apply them to Production and to any Preview environment used for webhook testing.

```text
WHATSAPP_VERIFY_TOKEN=<a new long random value chosen by Creativa Poeta>
WHATSAPP_APP_SECRET=<Meta app secret>
WHATSAPP_ACCESS_TOKEN=<permanent Meta system-user token>
WHATSAPP_PHONE_NUMBER_ID=<Meta phone number ID>
WHATSAPP_DISPLAY_PHONE_NUMBER=<public Creativa Poeta WhatsApp number>
WHATSAPP_BUSINESS_ACCOUNT_ID=<Meta WhatsApp Business Account ID>
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_REFERRAL_APPROVED_TEMPLATE=cp_referral_application_approved
WHATSAPP_REFERRAL_REJECTED_TEMPLATE=cp_referral_application_rejected
WHATSAPP_TEMPLATE_LANGUAGE_EN=en
WHATSAPP_TEMPLATE_LANGUAGE_FR=fr
WHATSAPP_TEMPLATE_LANGUAGE_NL=nl
WHATSAPP_TEMPLATE_LANGUAGE_RW=rw_RW
```

The Graph API version is configurable so it can be upgraded independently after Meta announces a deprecation.

## 3. Webhook configuration

Use this production callback URL in the WhatsApp product settings:

```text
https://<BACKEND_DOMAIN>/api/whatsapp/webhook
```

Use exactly the same value for **Verify token** as `WHATSAPP_VERIFY_TOKEN`. Subscribe the app to the `messages` webhook field. The same field carries inbound messages and delivery/read/failure status updates.

The backend rejects POST requests whose `X-Hub-Signature-256` HMAC does not match `WHATSAPP_APP_SECRET`.

## 4. Dashboard permissions

- `whatsapp:read`: view the shared inbox and conversations.
- `whatsapp:reply`: claim/release conversations, change status, add notes and reply.
- `whatsapp:manage`: reserved for later account/template administration.

Operations administrators receive all three permissions by role. Support & Email administrators receive read and reply access. Individual allow/deny overrides remain available in **Users**.

## 5. Production acceptance test

1. Send a WhatsApp message from a phone that is not the Creativa Poeta business number.
2. Confirm that the conversation appears once in **Dashboard → WhatsApp**.
3. Open it and confirm that its unread count clears.
4. Claim it with one administrator and confirm that another administrator cannot send a duplicate reply.
5. Send a reply and verify `sent`, `delivered`, then `read` in the dashboard.
6. Add an internal note and verify that it is not sent to the client.
7. Temporarily use an invalid webhook signature in a controlled API test and confirm that the backend returns `401`.

## Current first-release scope

- Inbound text, interactive responses, locations, contacts and media metadata are recorded.
- Team replies are text messages during Meta's 24-hour customer-service window.
- The dashboard blocks free-form replies after that window. Referral approval and rejection notifications use approved Meta templates; direct media download remains outside the current scope.

## 6. Preferred-channel referral notifications

When an applicant selects WhatsApp as the preferred contact channel, approval and rejection messages are sent with an approved Meta template. This is required because an administrative decision can happen outside Meta's 24-hour customer-service window.

Routing rules:

- WhatsApp preferred and available: send the corresponding WhatsApp template.
- WhatsApp fails and an email is available: send the same decision by email and record that fallback in the dashboard.
- Email preferred: send by email.
- Phone, SMS or another channel: record `manual_required` so the team can contact the person manually.
- The dashboard stores the requested channel, actual delivery channel, provider message ID and the latest delivery status.

Create the following templates in **WhatsApp Manager -> Message templates**. Meta must approve every language before production use.

### Approval template

Name: `cp_referral_application_approved`

Category: Utility

Body parameters, in this exact order:

1. Applicant name
2. Partner ID
3. Private client-introduction form URL
4. Public client invitation URL

Recommended English body:

```text
Hello {{1}}, your Creativa Poeta client-introducer application has been approved.

Your partner ID is {{2}}.

Use this private link to securely introduce a client to Creativa Poeta: {{3}}

Keep the private link confidential. Do not share it.

Copy and share this public invitation link with a person or business interested in Creativa Poeta: {{4}}
```

Create equivalent French, Dutch and Kinyarwanda translations under the same template name. The variable positions must remain identical in every language.

### Rejection template

Name: `cp_referral_application_rejected`

Category: Utility

Body parameters, in this exact order:

1. Applicant name
2. Decision reason

Recommended English body:

```text
Hello {{1}}, Creativa Poeta has reviewed your client-introducer application. We cannot approve it at this time.

Reason: {{2}}

You may contact Creativa Poeta if you need clarification.
```

Create equivalent French, Dutch and Kinyarwanda translations under the same template name. If Meta does not offer a requested locale code, set the matching `WHATSAPP_TEMPLATE_LANGUAGE_*` variable to an approved language available on that template.
