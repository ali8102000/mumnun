-- AI replies for existing support tickets. This migration is additive and does not change existing RLS policies.
ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS is_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
    REFERENCES public.support_ticket_messages(id) ON DELETE SET NULL;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS needs_staff boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_messages_one_ai_reply_per_message
  ON public.support_ticket_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_needs_staff_created_at_idx
  ON public.support_tickets(needs_staff, created_at DESC)
  WHERE needs_staff = true;

COMMENT ON COLUMN public.support_ticket_messages.is_ai IS
  'True only for server-generated Mamnoon AI support replies.';
COMMENT ON COLUMN public.support_ticket_messages.reply_to_message_id IS
  'User message this AI response answers; unique to prevent duplicate replies.';
COMMENT ON COLUMN public.support_tickets.needs_staff IS
  'True when the AI could not safely resolve the support issue and staff follow-up is required.';
