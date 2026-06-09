IF OBJECT_ID('monthly_inputs', 'U') IS NULL
BEGIN
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_monthly_inputs_source_local_id' AND object_id = OBJECT_ID('monthly_inputs'))
BEGIN
  CREATE UNIQUE INDEX UQ_monthly_inputs_source_local_id ON monthly_inputs(source_local_id) WHERE source_local_id IS NOT NULL;
END
GO
