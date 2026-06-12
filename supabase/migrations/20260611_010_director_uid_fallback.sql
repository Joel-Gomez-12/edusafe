-- Fallback: director puede leer su propia fila en directors usando auth.uid()
-- sin depender del claim app_tenant_id del JWT hook.
-- Necesario para que AuthContext resuelva el rol cuando el JWT hook no ha enriquecido el token.
-- Nombre diferente al de mig 002 ("directors_self_read") para evitar conflicto.

CREATE POLICY "directors_uid_fallback" ON public.directors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
