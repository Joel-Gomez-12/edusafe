-- Permite que cada usuario de staff lea su propia fila en mediators/directors
-- usando auth.uid() (siempre disponible, no requiere claims del hook)
-- Necesario como fallback cuando el JWT hook no ha enriquecido el token todavía

CREATE POLICY "mediators_self_read" ON public.mediators
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "directors_self_read" ON public.directors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
