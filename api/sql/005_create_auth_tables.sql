IF OBJECT_ID('app_users', 'U') IS NULL
BEGIN
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
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_app_users_username' AND object_id = OBJECT_ID('app_users'))
BEGIN
  CREATE UNIQUE INDEX UQ_app_users_username ON app_users(username);
END
GO

IF NOT EXISTS (SELECT 1 FROM app_users WHERE username = 'admin')
BEGIN
  INSERT INTO app_users (username, password_hash, full_name, [role], active, created_at)
  VALUES ('admin', '$2a$10$Y4CI57qFWqdsFPaE5QghFuDTWUjlBxNdQpfpixI4fYYSlKP9oREVW', 'Administrator', 'admin', 1, SYSUTCDATETIME());
END
GO
