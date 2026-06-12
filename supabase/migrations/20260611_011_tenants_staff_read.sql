-- Staff puede leer los datos básicos de su propio tenant.
-- Necesario para mostrar el nombre/tipo del tenant en perfiles y dashboards.
-- Política doble: JWT claims (producción) + auth.uid() fallback (desarrollo).

CREATE POLICY "tenants_staff_read" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id = auth_tenant_id()
    AND auth_role() IN ('mediador', 'director')
  );

-- Fallback: permite leer el propio tenant aunque el JWT hook no haya inyectado claims
CREATE POLICY "tenants_uid_fallback" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM public.directors WHERE user_id = auth.uid()
      UNION
      SELECT tenant_id FROM public.mediators WHERE user_id = auth.uid()
    )
  );
