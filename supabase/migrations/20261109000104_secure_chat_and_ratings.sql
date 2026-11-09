-- Prevent chat sender impersonation and ratings unrelated to a completed request.
DROP POLICY IF EXISTS "Users insert messages in own chats" ON public.messages;
CREATE POLICY "Participants insert messages as themselves"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.id = messages.chat_id
      AND (c.customer_id = auth.uid() OR c.provider_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users insert own ratings" ON public.ratings;
CREATE POLICY "Participants rate completed request counterpart"
ON public.ratings FOR INSERT TO authenticated
WITH CHECK (
  rater_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.id = ratings.request_id
      AND sr.status = 'completed'::public.request_status
      AND (
        (sr.customer_id = auth.uid() AND sr.provider_id = ratings.ratee_id)
        OR
        (sr.provider_id = auth.uid() AND sr.customer_id = ratings.ratee_id)
      )
  )
);
