-- Tour de boas-vindas (componentes/Tour.tsx): aparece uma vez por conta, em qualquer
-- aparelho. A pessoa pode ver de novo pela Central de ajuda.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS tour_visto_em timestamptz;
