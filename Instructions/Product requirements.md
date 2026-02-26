As I mentioned before I need full ownership of the product. All
deliverables must be work-made-for-hire and assigned to me.  
The code must be developed in a repo owned by my GitHub/Azure DevOps
organization where I am the admin. I will provide any details requested.

No secrets or infrastructure can live in your personal accounts;
everything must be in my Azure subscription and my Apple/Google
developer accounts.

At handoff I need: full source code (mobile/backend/admin), database
scripts, IaC/deployment scripts, documentation, dependency/license list,
and the ability to build and deploy independently without you.

---

**📌 FINAL Product Requirements -- Railroad Navigation + Safety Proximity System**

**Version: v1.5 -- Final Consolidated**

---

**0) Context & Intent (Why this must be built this way)**

- Current system exists **on-prem on a local machine**, which is **not at a railroad location**.
- This is **not sufficient for real testing or production-like use** (multi-device sync, alerts, offline packs, push notifications). I mentioned in the requirements that this was a must to demonstrate to senior leaders that it works.
- **Migration to Azure is mandatory** so the system can be tested in real field conditions and used in production or production-like pilots.
- This is intended to be a **real operational safety system**, not a demo.
- I am willing to compensate within reason for migration + cloud deployment + optional exploratory work (e.g., CarPlay feasibility).

---

**1) Platforms & Access**

- iOS + Android mobile apps (downloadable)
- Admin web dashboard (desktop browser)
- Secure authentication
- User profile: Name, Phone, Agency, Role (Field, Supervisor, Admin)
- Multi-tenant support (per-agency configuration)

---

**2) Core Map & Navigation (Baseline -- must include all reference app features)**

- Interactive map (pan/zoom/rotate)
- GPS location display
- Follow-me mode
- Multiple basemap styles (light/dark/satellite/labels)
- Layer toggles (tracks, crossings, assets, etc.)
- Layers control what is searchable
- Structured track search:
  - Subdivision *(admin-modifiable list)*
  - Line Segment *(admin-modifiable list)*
  - Milepost *(precision configurable)*
  - Track Type *(admin-modifiable list)*
  - Track Number *(admin-modifiable list)*
- Free-text fuzzy search (limited to enabled layers)
- Tap asset → highlight + details panel
- Copy location details
- Navigate to Apple Maps / Google Maps
- Drop pins

---

**3) Live Location HUD (Top-Right Label -- Field Use)**

- Always visible while hyrailing/driving:
  - Subdivision
  - Milepost (to 4 decimals -- precision configurable)
  - Track #
  - Track Type
  - GPS accuracy indicator
- One-tap hide/show
- **Admin controls which fields appear and formatting (per agency)**

---

**4) Offline Mode (Required for Production Testing)**

- Pre-download:
  - subdivisions
  - agencies / territories
- Offline access to:
  - tracks
  - mileposts
  - assets
- GPS works offline
- Sync when back online
- **Admin controls which layers/areas can be downloaded per agency**

---

**5) Milepost Interpolation (Linear Referencing)**

- Known MP anchor points with lat/long
- Interpolate MP between anchors
- Live MP display to **4 decimals**
- Display Subdivision / Track Type / Track #
- **Admin controls anchor sources + refresh cadence**

---

**6) Authority Entry (Track Limits Safety)**

Admin-configurable fields:
- Employee Name
- Phone
- Subdivision
- Begin MP
- End MP
- Track Type
- Track Number
- Activate/end authority session
- Authority limits shown on map

---

**7) End-of-Limits Alerts (Geo-Fence Safety)**

- Configurable thresholds:
  - 0.25 / 0.5 / 0.75 / 1.0 miles
- Push + visual alerts approaching limits
- Repeat until user exits zone
- **All thresholds + repeat frequency configurable by admin**

---

**8) User Proximity & Overlapping Authority Alerts**

- Show nearby active users (filtered by role/territory)
- Proximity alerts at:
  - 1.0 / 0.75 / 0.5 / 0.25 miles
- Overlapping authority detection:
  - Notify both users
  - Show name + phone *(admin-configurable visibility)*
  - Highlight overlapping MP range
- Real-time updates

---

**9) Safety Notifications**

- Push notifications
- Visual + vibration/audio alerts
- Quiet hours / shift rules
- **Admin controls all notification behavior**

---

**10) Pin Drops & Field Markups (UPDATED -- Photo Support Required)**

- **Admin-modifiable pin categories**:
  - Scrap Rail
  - Scrap Ties
  - Monitor Location
  - Defect
  - Work Needed
  - Obstruction
  - *(Admin can rename, add, remove categories without code changes)*
- Each pin stores:
  - Category
  - Notes
  - Milepost (auto-captured)
  - Latitude / Longitude (auto-captured)
  - Timestamp
  - **One or more photos (taken in-app or selected from gallery)**
  - Photo metadata (timestamp, GPS accuracy at capture)
- **Offline photo capture**:
  - Photos can be taken offline
  - Photos sync automatically when back online
  - App shows sync status
- **Export / Share**:
  - End-of-trip export (Text / Email) includes MP + Lat/Long + notes
  - Photos included as links or attachments (policy-based)
- **Admin controls**:
  - Enable/disable photos per pin category
  - Max photos per pin
  - Compression/file size limits
  - Whether photos are required for certain categories
  - Photo retention policy
- **Security**:
  - Photos stored securely in cloud storage
  - Role-based access to view photos

---

**11) Admin Desktop Dashboard (Web)**

- Live map:
  - active users
  - active authorities
  - overlapping limits
  - proximity alerts
- Filters by agency/subdivision/date
- Authority monitoring
- Alert + GPS accuracy degradation audit logs
- Reporting & export for safety/compliance
- **Admin configuration panel**:
  - alert thresholds
  - proximity rules
  - authority field definitions
  - required vs optional fields
  - layer visibility
  - offline package availability
  - subdivisions, track types
  - pin categories
  - photo requirements & limits
- Per-agency configuration

---

**12) Audit & Logging**

- Authority start/end
- Proximity events
- Alerts triggered
- GPS accuracy degradation events
- User sessions
- **Admin-configurable retention policy**

---

**13) Multi-Device Testing (Production-Like Testing Required)**

- Support testing with multiple devices simultaneously
- TEST/UAT environment separate from PROD
- Simulated GPS playback (recommended)
- Location spoofing allowed **only in TEST**
- Must validate:
  - overlapping authority
  - proximity alerts
  - end-of-limits alerts
  - GPS accuracy alerts

---

**14) Migration Requirement (On-Prem → Azure is Mandatory)**

- Current system is on-prem on a local machine
- **Must migrate to Azure** to:
  - test in real field conditions
  - sync multiple mobile devices
  - validate push notifications
  - validate offline downloads
  - support production-like testing
- Mobile apps must use config-driven API endpoints (no hardcoding)

**Developer deliverables:**

- Azure architecture diagram
- DEV / TEST / PROD environment setup
- Repeatable deployment scripts
- Data migration scripts
- Validation + rollback plan

---

**15) Security & Privacy**

- Encryption in transit + at rest
- Role-based access
- Territory-based visibility
- Secrets in Azure Key Vault
- Admin-only global visibility

---

**16) Performance & Reliability**

- GPS accuracy confidence indicator
- Adaptive GPS polling
- Graceful degradation on poor signal
- Sync retry on reconnect

---

**17) GPS Accuracy & Satellite Loss Alerts (Critical Safety)**

- Immediate alert if GPS accuracy exceeds admin-set threshold
- Immediate alert if satellite signal is lost or stale
- "Location Unreliable" mode
- **Admin controls**:
  - thresholds
  - alert types
  - repeat frequency
  - whether authority alerts pause under low accuracy
- All events logged in admin dashboard

---

**18) CarPlay Projection (Ad-Hoc Exploratory Request -- Cost Requested)**

- Exploratory feasibility for Apple CarPlay projection:
  - live location HUD
  - follow-me map
  - navigation (read-only, driver safe)
- **Not required for MVP**
- Developer to provide:
  - feasibility assessment
  - technical approach
  - **cost + timeline estimate**

---

**19) Commercial Terms & Expectations**

- This must be usable in **production or production-like pilots**, not just demos.
- Azure migration is required.
- Willing to compensate within reason for:
  - migration
  - cloud deployment
  - environment setup
  - CarPlay feasibility exploration
- Developer to provide:
  - migration cost estimate
  - monthly hosting estimate
  - optional CarPlay exploration cost

---

**🎯 Definition of "Done"**

- Can log into Azure-hosted system
- Multiple phones sync to same environment
- Alerts fire in real time
- Admin dashboard shows live users + alerts
- Offline downloads work
- GPS accuracy alerts work
- Photos attach to pin drops and sync
- System can be used in a real pilot territory