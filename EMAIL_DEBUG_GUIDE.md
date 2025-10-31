# Email Issues on Render - Diagnosis & Fix Guide

## 🔍 **Diagnosis Steps**

### 1. **Test Email Endpoint**
After deploying, test the email configuration:
```
GET https://your-render-url.onrender.com/api/test-email
```

This will show you exactly what's wrong with the email setup.

### 2. **Check Render Environment Variables**
Make sure these are set in your Render dashboard:

**Required Environment Variables:**
- `EMAIL_USER=izanyibukayvette@gmail.com`
- `EMAIL_PASS=hfapkxunpnesmggz`

**How to set them on Render:**
1. Go to your Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Add the variables above

### 3. **Gmail App Password Issues**
The current password `hfapkxunpnesmggz` is an App Password, which is correct, but there might be issues:

**Potential Problems:**
- App password might be expired or revoked
- Gmail account might have security restrictions
- IP-based restrictions from Google

## 🛠 **Fixes to Try**

### **Fix 1: Regenerate Gmail App Password**
1. Go to Google Account settings
2. Security → 2-Step Verification
3. App passwords
4. Generate new password for "Mail"
5. Update `EMAIL_PASS` in Render environment variables

### **Fix 2: Alternative SMTP Configuration**
If Gmail continues to fail, consider these alternatives:

**Option A: Use SendGrid (Recommended for production)**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

**Option B: Use Outlook/Office365**
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-outlook-email
SMTP_PASS=your-outlook-password
```

### **Fix 3: Update Email Configuration**
If you want to use alternative SMTP, update `src/utils/sendEmail.ts`:

```typescript
const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    },
});
```

## 🚀 **Testing Process**

1. **Deploy changes** to Render
2. **Test email endpoint**: `GET /api/test-email`
3. **Check logs** in Render dashboard
4. **Test project form** submission
5. **Verify email delivery**

## 📋 **Common Error Messages & Solutions**

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid login` | Wrong credentials | Regenerate app password |
| `Less secure app` | Regular password used | Use app password with 2FA |
| `ENOTFOUND` | Network/DNS issue | Check SMTP host settings |
| `ECONNREFUSED` | SMTP server rejected | Check port and security settings |
| `535 Authentication failed` | Gmail blocking | Try different SMTP provider |

## 🔧 **Environment Variables to Set on Render**

```env
# Required for current Gmail setup
EMAIL_USER=izanyibukayvette@gmail.com
EMAIL_PASS=hfapkxunpnesmggz

# Alternative SMTP (if switching from Gmail)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

## ⚡ **Quick Fix Steps**

1. **Set environment variables** on Render
2. **Deploy** this updated code
3. **Test** via `/api/test-email` endpoint
4. **Check Render logs** for detailed error messages
5. **Try project form** submission