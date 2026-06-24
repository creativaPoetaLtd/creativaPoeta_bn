# Admin Security

Public admin signup is disabled.

Required production environment variables:

- `JWT_SECRET`: strong private JWT secret.
- `ADMIN_BOOTSTRAP_SECRET`: strong recovery secret used only to create or recover the first `super_admin`.

Admin roles:

- `super_admin`: can create, update, disable and delete admin users.
- `admin`: can manage project/contact/admin-protected operational data.
- `editor`: reserved for content workflows.
- `viewer`: reserved for read-only workflows.

## First Super Admin

If the database is empty, create the first super admin with:

```http
POST /api/auth/signup
x-admin-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>

{
  "name": "Owner name",
  "email": "owner@example.com",
  "password": "strong-password"
}
```

## Recover Ownership

If admin users exist but no `super_admin` exists, promote one existing admin:

```http
POST /api/auth/bootstrap/promote-super-admin
x-admin-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>

{
  "email": "admin@example.com"
}
```

After the first `super_admin` exists, manage all admin users from the dashboard `Users` page.
