# Application Changelog
As of 1/26/2025 this file will be used to keep track of new features and changes to the structure of the
Additive Manufacturing Lab.

- Comment on new features.
- Provide database migration scripts when database changes occur.
- Provide information on when environment variable behaviors change.

<!-- 

Changelog Format:

## vx.x.x (month-day-year)

Insert a general description of the changes coming in this version.

### Release Highlight

Insert general changes and features which were added in this version.

### Database Changes

Insert any changes to the database and provide migration scripts.

### Environment Changes

Insert any changes related to configuring the application's environment variables.

 -->

## September-10-2026

Replaced the FarmAPI slicing call used by the model-analysis CRON with the orca-slicer-api container. Slicing is now submitted as an async job and polled until it finishes, so long slices no longer block or get re-submitted on the next tick.

### Release Highlights

- Model analysis now slices through orca-slicer-api instead of the FarmAPI `slice/info` endpoint.
- Slice jobs are submitted to `/slice-async` and polled, with a 5 minute timeout and cleanup of finished jobs.
- Added a run-overlap guard so a slice still in progress is not restarted by the next scheduled tick.

### Environment Changes

The CRON service now requires `SLICER_API_URL`, the URL of the orca-slicer-api container. The service will not start without it. Note that this must be reachable from inside the CRON container, so `localhost` is only correct when running outside of Docker.

`SLICER_PRINTER`, `SLICER_FILAMENT`, and `SLICER_PRESET` are optional and set the baseline profile used to compare all models. They default to `Bambu Lab X1 Carbon 0.4 nozzle`, `Bambu PLA Basic @BBL X1C`, and `0.20mm Standard @BBL X1C`, and must match profiles available in the orca-slicer-api instance.

`FARM_API_URL` is no longer read by the CRON service and can be dropped from its environment. It is still required by Web for printer control, so leave it in place there.

## April-09-2026

Overhauled the order request UI with a new 3-stage workflow (Upload → Parts → Finalize), where the manufacturing method is now chosen per-part instead of once per order. Introduced first-class `Material` and `ManufacturingMethod` tables so filament metadata (descriptions, icons, benefits/cons) is stored in the database rather than hardcoded. Replaced the old flat filament admin table with a three-column cascading manager and added an archive workflow so legacy filaments referenced by existing parts can be hidden from new orders without breaking history. Decoupled part status progression (printing, printed) from payment status.

### Release Highlights

- New 3-stage `/request-part` workflow replacing the old single-form UI. Users can now mix manufacturing methods within a single order (e.g. one SLA fixture plus three FDM brackets).
- `Material` and `ManufacturingMethod` are now proper database entities with rich metadata.
- Admin filament manager redesigned as a cascading panel: Method → Material → Colors, with per-variant archive/unarchive controls.
- Filaments referenced by existing parts can no longer be hard-deleted. Maintainers archive them instead, hiding them from new orders while preserving order history.
- Maintainer order view now shows the manufacturing method prominently per part and restricts filament supplementation to the part's own method.
- Maintainers can now mark parts as Printing/Printed/Failed without requiring the request to be paid first.

### Database Changes

Added `Material` and `ManufacturingMethod` tables. Replaced the `Technology` enum column on `Filament` with a `ManufacturingMethodShortName` FK, and added a FK on the existing `Material` column. Added an `IsArchived` flag on `Filament`, and switched `Part.AssignedFilamentId` / `Part.SupplementedFilamentId` to `ON DELETE RESTRICT` so active filaments cannot be silently orphaned.

#### Migration Script

```sql
BEGIN;

CREATE TABLE Material (
  ShortName varchar(50) PRIMARY KEY,
  WholeName varchar(100) NOT NULL,
  Description varchar(1000) NOT NULL DEFAULT '',
  Icon varchar(50),
  Benefits text[] NOT NULL DEFAULT '{}',
  Cons text[] NOT NULL DEFAULT '{}',
  LearnMoreURL varchar(2048)
);

CREATE TABLE ManufacturingMethod (
  ShortName varchar(50) PRIMARY KEY,
  WholeName varchar(100) NOT NULL,
  Description varchar(1000) NOT NULL DEFAULT '',
  Icon varchar(50),
  Benefits text[] NOT NULL DEFAULT '{}',
  Cons text[] NOT NULL DEFAULT '{}',
  LearnMoreURL varchar(2048),
  Company varchar(100),
  Unit varchar(10) NOT NULL DEFAULT 'g'
);

INSERT INTO Material (ShortName, WholeName) SELECT DISTINCT Material, Material FROM Filament ON CONFLICT (ShortName) DO NOTHING;

INSERT INTO ManufacturingMethod (ShortName, WholeName, Description, Icon, Benefits, Unit) VALUES
  ('FDM', 'Fused Deposition Modeling', 'Most common and cost-effective method. Great for prototypes and functional parts.', 'fa:Bolt', ARRAY['Prototyping', 'General Purpose Printing'], 'g'),
  ('Resin LCD', 'Resin Liquid Crystal Display', 'High-resolution printing with smooth surface finish and fine details.', 'fa:Droplet', ARRAY['High-Detail', 'Miniatures'], 'g'),
  ('Metal FFF', 'MarkForged Metal X', 'Industrial-grade metal printing for high-strength applications.', 'fa:Industry', ARRAY['Metal Tooling', 'High-Strength Fixtures'], 'g')
ON CONFLICT (ShortName) DO NOTHING;

ALTER TABLE Filament ADD COLUMN ManufacturingMethodShortName varchar(50) REFERENCES ManufacturingMethod(ShortName);

UPDATE Filament SET ManufacturingMethodShortName = CASE Technology::text
  WHEN 'FDM' THEN 'FDM'
  WHEN 'LCD' THEN 'Resin LCD'
  WHEN 'Metal FFF' THEN 'Metal FFF'
END;

ALTER TABLE Filament ALTER COLUMN ManufacturingMethodShortName SET NOT NULL;

ALTER TABLE Filament ADD CONSTRAINT fk_filament_material FOREIGN KEY (Material) REFERENCES Material(ShortName);

ALTER TABLE Filament DROP COLUMN Technology;
DROP TYPE IF EXISTS Technology;

ALTER TABLE Filament ADD COLUMN IF NOT EXISTS IsArchived bool NOT NULL DEFAULT FALSE;

ALTER TABLE Part DROP CONSTRAINT IF EXISTS part_assignedfilamentid_fkey;
ALTER TABLE Part DROP CONSTRAINT IF EXISTS part_supplementedfilamentid_fkey;

ALTER TABLE Part
  ADD CONSTRAINT part_assignedfilamentid_fkey
    FOREIGN KEY (AssignedFilamentId) REFERENCES Filament(Id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT part_supplementedfilamentid_fkey
    FOREIGN KEY (SupplementedFilamentId) REFERENCES Filament(Id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE Part DROP CONSTRAINT IF EXISTS part_assignedprintername_fkey;
DROP TABLE IF EXISTS Printer;

-- Verify, then COMMIT;
```

## August-06-2025 

Introduced **reregistration**, a new system designed to monitor user activity by requiring them to re-register their accounts within defined academic periods *(e.g., Fall, Spring, Summer)*.

### Release Highlight

- Initial implementation of Reregistration.
- Until future releases, this information is not displayed on Web.

### Database Changes

A new `ReregistrationSpan` table now defines registration periods, including their start and end dates, as well as descriptive names *(e.g., Summer of 2025, Fall of 2025)*.
The `ReregistrationSpanEntry` table associates individual user accounts with specific spans.

#### Migration Scripts

```sql
CREATE TABLE ReregistrationSpan (
  Id VARCHAR(40) PRIMARY KEY NOT NULL,
  BeginAt TIMESTAMP NOT NULL,
  EndAt TIMESTAMP NOT NULL,
  Name VARCHAR(256) NOT NULL
);

CREATE TABLE ReregistrationSpanEntry (
  SpanId VARCHAR(40) REFERENCES ReregistrationSpan(Id) ON DELETE CASCADE ON UPDATE CASCADE,
  SubmittedAt TIMESTAMP WITH TIME ZONE NOT NULL,
  AccountEmail VARCHAR(254) REFERENCES Account(Email) ON DELETE CASCADE ON UPDATE CASCADE,
  YearOfStudy VARCHAR(256) NOT NULL,
  Department VARCHAR(256) NOT NULL,
  PRIMARY KEY (SpanId, AccountEmail)
);
```

## January-29-2025

This commit comes with MANY changes and improvements to this service.

### Release Highlights

- UI overhaul for request viewing and management.
- Introduced a new popup-form system which makes the UI more dynamic and easier to navigate.
- Added full support for supplementing filaments and declaring a reason.
- Invoices and receipts can be downloaded for each requests made and quotes may have a separate fee value. 
- Compartmentalized many UI feature into components used in multiple places.
- Improved the security of a few download endpoints.

### Database Changes

Parts may now have a reason provided when filaments are supplemented and requests can now contain the amount of fees a quote should have.
Since models can be "flagged" we needed to add a few more columns to the table.

#### Migration Scripts

```sql
ALTER TABLE Part ADD COLUMN SupplementedReason VARCHAR(500);
```

```sql
BEGIN;

ALTER TABLE Request ADD COLUMN IF NOT EXISTS FeesInCents BIGINT;

UPDATE Request SET FeesInCents = 0 WHERE FeesInCents IS NULL AND TotalPriceInCents IS NOT NULL;

ALTER TABLE Request DROP CONSTRAINT IF EXISTS PAID_CHK;

ALTER TABLE Request ADD CONSTRAINT PAID_CHK CHECK (
    (PaidAt IS NOT NULL AND TotalPriceInCents IS NOT NULL AND FeesInCents IS NOT NULL AND EstimatedCompletionDate IS NOT NULL) OR
    (PaidAt IS NULL)
);

-- Ensure to commit the changes if successful!
-- COMMIT;
```

```sql
ALTER TABLE Model
ADD COLUMN FlaggedIssues VARCHAR(500),
ADD COLUMN FlaggedAt TIMESTAMP WITH TIME ZONE;

ALTER TABLE Model
ADD CONSTRAINT FLAGGED_CHK CHECK (
    (FlaggedIssues IS NOT NULL AND FlaggedAt IS NOT NULL) OR
    (FlaggedIssues IS NULL AND FlaggedAt IS NULL)
);
```

```sql
CREATE TABLE ProjectSpotlightAttachment (
  Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ProjectId UUID REFERENCES ProjectSpotlight(Id) ON DELETE CASCADE ON UPDATE CASCADE,
  FileName VARCHAR(256) NOT NULL,
  DownloadCount INT NOT NULL DEFAULT 0,
  UploadedAt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() 
);
```
