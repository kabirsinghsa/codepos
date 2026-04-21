insert into storage.buckets (id, name, public) values ('theme-assets', 'theme-assets', true) on conflict (id) do nothing;

create policy "Public read theme-assets"
on storage.objects for select
using (bucket_id = 'theme-assets');

create policy "Admins upload theme-assets"
on storage.objects for insert to authenticated
with check (bucket_id = 'theme-assets' and public.has_role(auth.uid(), 'admin'));

create policy "Admins update theme-assets"
on storage.objects for update to authenticated
using (bucket_id = 'theme-assets' and public.has_role(auth.uid(), 'admin'));

create policy "Admins delete theme-assets"
on storage.objects for delete to authenticated
using (bucket_id = 'theme-assets' and public.has_role(auth.uid(), 'admin'));