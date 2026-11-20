'use strict';
/**
 * Hourly bookings are submitted by index.html's sendHourlyRequest handler.
 * Do not register a second form submit listener here: a capture-phase listener
 * could submit the same booking twice or mask errors from the primary handler.
 * This file is intentionally inert until the legacy script tag is removed.
 */
