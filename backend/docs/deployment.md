# Deployment Guide

## 1. Environment Variables

| Variable | Required (prod) | Notes |
|---|---|---|
| `NODE_ENV` | yes | Set to `production` |
| `PORT` | yes | Default 5000 |
| `API_PREFIX` | no | `/api/v1` |
| `MONGO_URI` | yes | Atlas or self-hosted |
| `JWT_ACCESS_SECRET` | yes | 32+ chars. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | yes | Different from access secret |
| `CORS_ORIGINS` | yes | Comma-separated origins |
| `LOG_LEVEL` | no | `info` |
| `MANUAL_PAY_ACCOUNT` | conditional | Only if manual payments enabled |
| `MANUAL_PAY_BANK` | conditional | |
| `MANUAL_PAY_RECIPIENT_NAME` | conditional | |

Never commit real `.env` files. Use your host's secret manager.

## 2. Manual Payments — gating

Manual payments are **disabled by default** (no `MANUAL_PAY_ACCOUNT`). To enable:

1. Confirm the `payments.manual_arrangement` legal checklist item is `enabled` via `PATCH /api/v1/admin/legal-checklist/payments.manual_arrangement`.
2. Set `MANUAL_PAY_ACCOUNT` and `MANUAL_PAY_BANK`.
3. Deploy.

Never enable without professional legal review.

## 3. Docker (self-host)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with production secrets

export JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
docker compose up -d