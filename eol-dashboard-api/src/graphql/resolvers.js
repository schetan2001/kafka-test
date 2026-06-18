const vehicleService    = require("../services/vehicleService");
const telemetryService  = require("../services/telemetryService");
const diagnosticService = require("../services/diagnosticService");
const redisService      = require("../services/redisService");
const pinService        = require("../services/pinService");
const { getSignalStrength, getChargingStatus } = require("../utils/signalUtils");
const { ELEMENT_IDS, TPMS_FRONT_THRESHOLD, TPMS_REAR_THRESHOLD, PROVISIONED_STATUSES } = require("../constants/elementIds");

// Build a nested map: systemId → elementId → { value, updatedTime }
const buildTelemetryMap = (rows) => {
  const map = {};
  for (const row of rows) {
    if (!map[row.system_id]) map[row.system_id] = {};
    map[row.system_id][row.element_id] = {
      value: row.value,
      updatedTime: row.updated_time,
    };
  }
  return map;
};

// Build a map: systemId → [alerts]
const buildAlertsMap = (rows) => {
  const map = {};
  for (const row of rows) {
    if (!map[row.system_id]) map[row.system_id] = [];
    map[row.system_id].push({
      id:               String(row.id),
      dtcCode:          row.dtc_code,
      severity:         row.severity,
      status:           row.status,
      ecuType:          row.ecu_type,
      occurrenceCount:  row.occurrence_count,
      firstTriggeredAt: row.first_triggered_at ? String(row.first_triggered_at) : null,
      lastTriggeredAt:  row.last_triggered_at  ? String(row.last_triggered_at)  : null,
    });
  }
  return map;
};

const transformVehicle = (vehicle, telemetryMap, alertsMap, redisData, pinSyncStatus, now) => {
  const sid      = vehicle.system_id;
  const telemetry = telemetryMap[sid] || {};

  const getValue = (elementId) => telemetry[elementId]?.value ?? null; // Get event type based telemetry values.

  // Last tracked: max updated_time across all fetched rows for this vehicle
  const updatedTimes = Object.values(telemetry)
    .map((t) => Number(t.updatedTime))
    .filter(Boolean);
  const lastTracked = updatedTimes.length > 0 ? String(Math.max(...updatedTimes)) : null;

  // Ageing — provisioned_time may come as a Date object or raw epoch (int8)
  const provisionedMs =
    vehicle.provisioned_time instanceof Date
      ? vehicle.provisioned_time.getTime()
      : Number(vehicle.provisioned_time);
  const ageing =
    !isNaN(provisionedMs) && provisionedMs > 0
      ? Math.floor((now - provisionedMs) / 86400000)
      : null;

  // TPMS
  const tpmsFront  = getValue(ELEMENT_IDS.TPMS_FRONT);
  const tpmsRear   = getValue(ELEMENT_IDS.TPMS_REAR);
  const lowTyrePsi =
    (tpmsFront !== null && parseFloat(tpmsFront) < TPMS_FRONT_THRESHOLD) ||
    (tpmsRear  !== null && parseFloat(tpmsRear)  < TPMS_REAR_THRESHOLD);

  // LTE signal
  const rsrp = parseFloat(getValue(ELEMENT_IDS.AL_RSRP));
  const rsrq = parseFloat(getValue(ELEMENT_IDS.AL_RSRQ));
  const lteSignalStrength = getSignalStrength(rsrp, rsrq);

  // Charging: Redis first, fallback to DB telemetry value
  const lvl1 = redisData?.Vehicle_Mode__Vehicle_Mode_Lvl_1_RX_V ?? getValue(ELEMENT_IDS.MODE_LVL1);
  const lvl2 = redisData?.Vehicle_Mode__Vehicle_Mode_Lvl_2_RX_V ?? getValue(ELEMENT_IDS.MODE_LVL2);
  const chargingStatus = getChargingStatus(lvl1, lvl2);

  const alerts = alertsMap[sid] || [];

  return {
    systemId:           sid,
    model:              vehicle.model || null,
    provisioningStatus: PROVISIONED_STATUSES.includes(vehicle.lifecycle_state) ? "Completed" : "Pending",
    ageing,
    lastTracked,
    batterySoc:         getValue(ELEMENT_IDS.BATTERY_SOC),
    batteryTempMin:     getValue(ELEMENT_IDS.BATTERY_TEMP_MIN),
    batteryTempMax:     getValue(ELEMENT_IDS.BATTERY_TEMP_MAX),
    tpmsFront,
    tpmsRear,
    lowTyrePsi,
    lteSignalStrength,
    chargingStatus,
    alertCount:         alerts.length,
    alerts,
    pinSyncStatus:      pinSyncStatus ?? "FAILED",
  };
};

const getEolDashboard = async ({ systemIds, limit = 10, offset = 0, search, sortBy, sortOrder }) => {
  const sqlOffset  = offset * limit;
  const searchTerm = search?.trim() || null;

  // Round 1: paginated vehicle page + all summary counts in parallel
  // Summary counts always use all systemIds (no search filter — fleet-wide metrics)
  // Pagination total uses search filter when a term is provided
  const [
    pagedVehicles,
    summaryTotal,
    ageingCount,
    telemetrySummary,    // single query → { belowSocCount, lowTyreCount, chargingCount }
    alertVehicleCount,
    filteredTotal,       // null when no search term
  ] = await Promise.all([
    vehicleService.getPagedVehicles(systemIds, limit, sqlOffset, searchTerm, sortBy, sortOrder),
    vehicleService.getTotalCount(systemIds),
    vehicleService.getAgeingCount(systemIds),
    telemetryService.getSummaryCounts(systemIds),
    diagnosticService.getAlertVehicleCount(systemIds),
    searchTerm
      ? vehicleService.getTotalCount(systemIds, searchTerm)
      : Promise.resolve(null),
  ]);

  const paginationTotal = searchTerm ? filteredTotal : summaryTotal;

  const summary = {
    total:                 summaryTotal,
    belowThirtyPercentSoc: telemetrySummary.belowSocCount,
    lowTyrePsi:            telemetrySummary.lowTyreCount,
    charging:              telemetrySummary.chargingCount,
    alerts:                alertVehicleCount,
    ageingAboveTenDays:    ageingCount,
  };

  const pagination = { total: paginationTotal, limit, offset };

  if (pagedVehicles.length === 0) {
    return { summary, pagination, vehicles: [] };
  }

  const pagedSystemIds = pagedVehicles.map((v) => v.system_id);

  // Round 2: telemetry + alerts + Redis for this page only — all parallel
  // Single MGET replaces N individual Redis GET calls
  const [telemetryRows, alertRows, redisMap, pinSyncMap] = await Promise.all([
    telemetryService.getVehicleTelemetry(pagedSystemIds),
    diagnosticService.getActiveAlerts(pagedSystemIds),
    redisService.getVehicleModesMulti(pagedSystemIds),
    pinService.getPinSyncStatuses(pagedSystemIds),
  ]);

  const telemetryMap = buildTelemetryMap(telemetryRows);
  const alertsMap    = buildAlertsMap(alertRows);
  const now          = Date.now();

  const vehicles = pagedVehicles.map((vehicle) =>
    transformVehicle(vehicle, telemetryMap, alertsMap, redisMap[vehicle.system_id], pinSyncMap[vehicle.system_id], now)
  );

  return { summary, pagination, vehicles };
};

module.exports = { getEolDashboard };
