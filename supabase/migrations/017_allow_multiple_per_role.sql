begin;

-- National roles (Amir dahil) artık birden fazla kişide olabilir.
-- Charter rollerinde zaten yalnızca President için tekillik zorunluydu
-- (one_president_per_charter); diğer charter görevleri (Road Captain,
-- Tail Gunner, Sgt. at Arms, Secretary, Treasurer, Vice President) hiçbir
-- zaman tekillik kısıtına tabi değildi, bu yüzden ek bir değişiklik
-- gerekmiyor.
drop index if exists public.one_person_per_national_role;

commit;
