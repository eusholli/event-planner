// Canonical schema for intelligence reports. Shared between:
//   - the cron/batch dispatcher (sales-recon/intel-dispatcher.py reads
//     prompts/target-update.schema.json which mirrors this Zod definition)
//   - the interactive chat path (ws-proxy forwards a TargetUpdate on `final`)
//   - the webhook (validates incoming payloads against WebhookPayloadSchema)
//
// If you change TargetUpdateSchema you MUST also update
// /Users/eusholli/dev/sales-recon/prompts/target-update.schema.json.
// The lib/__tests__ round-trip test enforces parity.
import { z } from 'zod'

export const TargetTypeSchema = z.enum(['company', 'attendee', 'event'])

export const TargetUpdateSchema = z.object({
  type: TargetTypeSchema,
  name: z.string().min(1),
  summary: z.string().min(1),
  salesAngle: z.string().min(1),
  fullReport: z.string().min(1),
  recommendedAction: z.string().min(1).optional(),
  highlighted: z.boolean().optional(),
  linkedEventName: z.string().min(1).optional(),
})

export type TargetUpdate = z.infer<typeof TargetUpdateSchema>

export const WebhookPayloadSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.string().min(1).optional(),
  updatedTargets: z.array(TargetUpdateSchema),
  silent: z.boolean().optional(),
})

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
