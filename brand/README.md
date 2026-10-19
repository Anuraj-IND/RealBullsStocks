# Realbulls — Brand assets

Source of truth for the Realbulls identity. `logo.svg` is copied into
`apps/web/public/brand/logo.svg` for serving.

## Logo palette

| Token      | Hex       | Usage                          |
| ---------- | --------- | ------------------------------ |
| logoGreen  | `#019B69` | bull body / bullish mass       |
| logoBlue   | `#0052BE` | arrow / upward trajectory      |

The product UI uses the additional "Realbull Style" tokens (navy base, red
sell, amber CTA, lime buy). See `packages/shared/src/tokens.ts`.

## Files

- `logo.svg` — full horizontal lockup (mark only, no wordmark yet).

## Usage

```tsx
import { Logo } from "@/components/ui/Logo";
<Logo className="h-7" />
```
