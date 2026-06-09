CREATE TABLE pigs (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  tag NVARCHAR(50) NOT NULL,
  name NVARCHAR(100) NULL,
  type NVARCHAR(30) NOT NULL,
  breed NVARCHAR(100) NULL,
  dob DATE NOT NULL,
  source NVARCHAR(30) NULL,
  purchase_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  source_local_id NVARCHAR(120) NULL,
  notes NVARCHAR(MAX) NULL,
  status NVARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE UNIQUE INDEX UQ_pigs_tag ON pigs(tag);
GO
CREATE UNIQUE INDEX UQ_pigs_source_local_id ON pigs(source_local_id) WHERE source_local_id IS NOT NULL;
GO

CREATE TABLE app_users (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  username NVARCHAR(80) NOT NULL,
  password_hash NVARCHAR(255) NOT NULL,
  full_name NVARCHAR(120) NOT NULL,
  [role] NVARCHAR(20) NOT NULL,
  active BIT NOT NULL DEFAULT 1,
  last_login DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE UNIQUE INDEX UQ_app_users_username ON app_users(username);
GO

INSERT INTO app_users (username, password_hash, full_name, [role], active, created_at)
SELECT 'admin', '$2a$10$Y4CI57qFWqdsFPaE5QghFuDTWUjlBxNdQpfpixI4fYYSlKP9oREVW', 'Administrator', 'admin', 1, SYSUTCDATETIME()
WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE username = 'admin');
GO

CREATE TABLE events (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  pig_id UNIQUEIDENTIFIER NOT NULL,
  [date] DATE NOT NULL,
  [type] NVARCHAR(30) NOT NULL,
  source_local_id NVARCHAR(120) NULL,
  sale_price DECIMAL(18,2) NULL,
  sale_weight DECIMAL(10,2) NULL,
  litter_size INT NULL,
  notes NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_events_pigs FOREIGN KEY (pig_id) REFERENCES pigs(id)
);
GO
CREATE UNIQUE INDEX UQ_events_source_local_id ON events(source_local_id) WHERE source_local_id IS NOT NULL;
GO

CREATE TABLE weights (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  pig_id UNIQUEIDENTIFIER NOT NULL,
  [date] DATE NOT NULL,
  source_local_id NVARCHAR(120) NULL,
  weight DECIMAL(10,2) NOT NULL,
  bcs NVARCHAR(10) NULL,
  notes NVARCHAR(MAX) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_weights_pigs FOREIGN KEY (pig_id) REFERENCES pigs(id)
);
GO
CREATE UNIQUE INDEX UQ_weights_source_local_id ON weights(source_local_id) WHERE source_local_id IS NOT NULL;
GO

CREATE TABLE feed_logs (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  [date] DATE NOT NULL,
  pig_id UNIQUEIDENTIFIER NOT NULL,
  feed_type NVARCHAR(40) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  cost_per_kg DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  feeding_time NVARCHAR(20) NULL,
  notes NVARCHAR(MAX) NULL,
  source_local_id NVARCHAR(120) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_feed_logs_pigs FOREIGN KEY (pig_id) REFERENCES pigs(id)
);
GO
CREATE UNIQUE INDEX UQ_feed_logs_source_local_id ON feed_logs(source_local_id) WHERE source_local_id IS NOT NULL;
GO

CREATE TABLE purchases (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  [date] DATE NOT NULL,
  feed_type NVARCHAR(40) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  cost_per_kg DECIMAL(18,2) NOT NULL,
  total_cost DECIMAL(18,2) NOT NULL,
  supplier NVARCHAR(120) NULL,
  notes NVARCHAR(MAX) NULL,
  reorder_level DECIMAL(10,2) NULL,
  source_local_id NVARCHAR(120) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE UNIQUE INDEX UQ_purchases_source_local_id ON purchases(source_local_id) WHERE source_local_id IS NOT NULL;
GO

CREATE TABLE monthly_inputs (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  [month] NVARCHAR(7) NOT NULL,
  category NVARCHAR(40) NOT NULL,
  product NVARCHAR(150) NOT NULL,
  scope NVARCHAR(40) NULL,
  specific_pigs_json NVARCHAR(MAX) NULL,
  qty NVARCHAR(120) NULL,
  unit_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  administered_by NVARCHAR(120) NULL,
  next_due DATE NULL,
  supplier NVARCHAR(120) NULL,
  withdrawal INT NULL,
  notes NVARCHAR(MAX) NULL,
  source_local_id NVARCHAR(120) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE UNIQUE INDEX UQ_monthly_inputs_source_local_id ON monthly_inputs(source_local_id) WHERE source_local_id IS NOT NULL;
GO

CREATE TABLE transactions (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  [date] DATE NOT NULL,
  [type] NVARCHAR(20) NOT NULL,
  category NVARCHAR(50) NOT NULL,
  [description] NVARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  [method] NVARCHAR(30) NULL,
  [ref] NVARCHAR(100) NULL,
  source_local_id NVARCHAR(120) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE UNIQUE INDEX UQ_transactions_source_local_id ON transactions(source_local_id) WHERE source_local_id IS NOT NULL;
GO
