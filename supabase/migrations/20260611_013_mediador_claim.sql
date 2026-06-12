-- Permite que un mediador tome un caso no asignado (assigned_mediator IS NULL)
-- y solo pueda asignárselo a sí mismo.

CREATE POLICY "reports_mediator_claim" ON public.reports
  FOR UPDATE
  USING (
    tenant_id = auth_tenant_id()
    AND auth_role() = 'mediador'
    AND assigned_mediator IS NULL
  )
  WITH CHECK (
    assigned_mediator = auth_staff_id()
  );

-- Fallback messages: permite leer si eres el mediador asignado,
-- verificado por auth.uid() sin necesitar JWT claims.
-- Cubre el caso en que el hook no ha enriquecido el token todavía.

CREATE POLICY "messages_uid_fallback" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM reports r
      JOIN mediators m ON m.id = r.assigned_mediator
      WHERE r.id = messages.report_id
        AND m.user_id = auth.uid()
    )
  );
