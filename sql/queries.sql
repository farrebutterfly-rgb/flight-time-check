-- name: outcome_by_zone
-- How the 25 searches with flights came out, by whether the two airports share a time zone.
SELECT zone,
       COUNT(*)                                                    AS searches,
       SUM(outcome = 'shifted')                                    AS wrong_hour,
       SUM(outcome = 'utc_label')                                  AS shown_as_utc,
       SUM(outcome IN ('shifted', 'utc_label'))                    AS wrong_or_mislabelled,
       ROUND(100.0 * SUM(outcome IN ('shifted', 'utc_label')) / COUNT(*), 1) AS pct
FROM search
WHERE outcome <> 'void'
GROUP BY zone
ORDER BY pct DESC;

-- name: planned_against_chosen_after
-- Searches 23 to 27 were chosen after the first 22 had been seen. Kept apart here.
SELECT CASE planned WHEN 1 THEN 'planned in advance' ELSE 'chosen afterwards' END AS how_chosen,
       COUNT(*)                                     AS searches,
       SUM(outcome IN ('shifted', 'utc_label'))     AS wrong_or_mislabelled
FROM search
WHERE outcome <> 'void'
GROUP BY planned
ORDER BY planned DESC;

-- name: size_of_the_shift
-- By how much the chat moved the clock, flight by flight, where it moved it.
SELECT shift_dep_min / 60 AS hours_moved,
       COUNT(*)           AS flights
FROM flight
WHERE web_dep IS NOT NULL AND shift_dep_min <> 0
GROUP BY hours_moved
ORDER BY hours_moved;

-- name: flights_matched
SELECT COUNT(*)                                        AS listed_by_chatgpt,
       SUM(web_dep IS NOT NULL)                        AS matched_to_website,
       SUM(web_dep IS NOT NULL AND chat_fare_sek <> web_fare_sek) AS fare_differs
FROM flight;

-- name: repeats
-- Ten new chats, the same Stockholm to Gothenburg search. Median by the middle of the sorted answered runs.
WITH answered AS (
    SELECT wall_seconds, ROW_NUMBER() OVER (ORDER BY wall_seconds) AS k, COUNT(*) OVER () AS m
    FROM repeat_run WHERE wall_seconds IS NOT NULL
)
SELECT (SELECT SUM(result = 'wrong') FROM repeat_run)            AS wrong,
       (SELECT SUM(result = 'right') FROM repeat_run)            AS right_answers,
       (SELECT SUM(result = 'error') FROM repeat_run)            AS errors,
       (SELECT ROUND(AVG(wall_seconds)) FROM answered WHERE k IN ((m + 1) / 2, (m + 2) / 2)) AS median_seconds,
       (SELECT ROUND(MIN(wall_seconds)) FROM answered)           AS fastest,
       (SELECT ROUND(MAX(wall_seconds)) FROM answered)           AS slowest;

-- name: ab_by_format
SELECT format,
       COUNT(*)          AS trials,
       SUM(right_times)  AS right_times
FROM ab_trial
GROUP BY format
ORDER BY format;
