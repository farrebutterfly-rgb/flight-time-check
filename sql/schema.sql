-- The test as tables, for BI. Loaded by sql/run.py from the files in data/.

CREATE TABLE search (
    n            INTEGER PRIMARY KEY,       -- search number, 1 to 27
    origin       TEXT NOT NULL,             -- IATA
    destination  TEXT NOT NULL,
    zone         TEXT,                      -- same, cross or utc0; NULL when void
    outcome      TEXT NOT NULL,             -- shifted, utc_label, rescued, ok, void
    planned      INTEGER NOT NULL,          -- 1 if chosen before the first answer was seen
    chat_note    TEXT
);

CREATE TABLE flight (
    n            INTEGER NOT NULL REFERENCES search(n),
    flight_no    TEXT NOT NULL,
    chat_dep     TEXT NOT NULL,             -- as ChatGPT showed it
    chat_arr     TEXT NOT NULL,
    web_dep      TEXT,                      -- matched website row, NULL if not on page one
    web_arr      TEXT,
    shift_dep_min INTEGER,                  -- chat minus website, minutes
    shift_arr_min INTEGER,
    chat_fare_sek INTEGER,
    web_fare_sek  INTEGER
);

CREATE TABLE repeat_run (
    run          INTEGER PRIMARY KEY,
    result       TEXT NOT NULL,             -- wrong, right, error
    wall_seconds REAL                       -- question sent to answer finished; NULL on error
);

CREATE TABLE ab_trial (
    arm          TEXT NOT NULL,             -- A, C: as returned today; B, D: offset; E: stopgap
    format       TEXT NOT NULL,             -- z, offset, stopgap
    route        TEXT NOT NULL,
    trial        INTEGER NOT NULL,
    right_times  INTEGER NOT NULL           -- 1 if ChatGPT showed the website's local times
);
