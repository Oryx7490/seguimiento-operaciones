ALTER TYPE attachment_type ADD VALUE IF NOT EXISTS 'screen_photo';
ALTER TYPE attachment_type ADD VALUE IF NOT EXISTS 'technical_file';

COMMENT ON TYPE attachment_type IS
  'screen_photo: fotos de la pantalla instalada; technical_file: planos, configuraciones, software y otros entregables técnicos del proyecto.';
