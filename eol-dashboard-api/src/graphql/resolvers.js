const vehicleService    = require("../services/vehicleService");
const telemetryService  = require("../services/telemetryService");
const diagnosticService = require("../services/diagnosticService");
const redisService      = require("../services/redisService");
const { getSignalStrength, getChargingStatus } = require("../utils/signalUtils");
const { ELEMENT_IDS, ALL_ELEMENT_IDS, LOW_TYRE_THRESHOLD, PROVISIONED_STATUSES } = require("../constants/elementIds");

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
      id:             String(row.id),
      dtcCode:        row.dtc_code,
      dtcDescription: row.dtc_description,
      severity:       row.severity,
      ecuType:        row.ecu_type,
      ticketStatus:   row.ticket_status,
      createdTime:    row.created_time != null ? String(row.created_time) : null,
    });
  }
  return map;
};

const transformVehicle = (vehicle, telemetryMap, alertsMap, redisData, now) => {
  const sid      = vehicle.system_id;
  const telemetry = telemetryMap[sid] || {};

  const getValue = (elementId) => telemetry[elementId]?.value ?? null;

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
    (tpmsFront !== null && parseFloat(tpmsFront) < LOW_TYRE_THRESHOLD) ||
    (tpmsRear  !== null && parseFloat(tpmsRear)  < LOW_TYRE_THRESHOLD);

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
    systemId:         sid,
    model:            vehicle.model || null,
    provisioningStatus: PROVISIONED_STATUSES.includes(vehicle.lifecycle_state) ? "Completed" : "Pending",
    ageing,
    lastTracked,
    batterySoc:       getValue(ELEMENT_IDS.BATTERY_SOC),
    batteryTempMin:   getValue(ELEMENT_IDS.BATTERY_TEMP_MIN),
    batteryTempMax:   getValue(ELEMENT_IDS.BATTERY_TEMP_MAX),
    tpmsFront,
    tpmsRear,
    lowTyrePsi,
    lteSignalStrength,
    chargingStatus,
    alertCount:       alerts.length,
    alerts,
  };
};

const getEolDashboard = async ({ systemIds, limit = 10, offset = 0 }) => {
  // offset is page number (0-indexed) → SQL OFFSET = page × pageSize
  const sqlOffset = offset * limit;

  // Round 1: paginated vehicle page + all summary counts in parallel
  const [
    pagedVehicles,
    totalCount,
    ageingCount,
    belowSocCount,
    lowTyreCount,
    chargingCount,
    alertVehicleCount,
  ] = await Promise.all([
    vehicleService.getPagedVehicles(systemIds, limit, sqlOffset),
    vehicleService.getTotalCount(systemIds),
    vehicleService.getAgeingCount(systemIds),
    telemetryService.getBelowSocCount(systemIds),
    telemetryService.getLowTyreCount(systemIds),
    telemetryService.getChargingCount(systemIds),
    diagnosticService.getAlertVehicleCount(systemIds),
  ]);

  const summary = {
    total:                 totalCount,
    belowThirtyPercentSoc: belowSocCount,
    lowTyrePsi:            lowTyreCount,
    charging:              chargingCount,
    alerts:                alertVehicleCount,
    ageingAboveTenDays:    ageingCount,
  };

  const pagination = { total: totalCount, limit, offset };

  if (pagedVehicles.length === 0) {
    return { summary, pagination, vehicles: [] };
  }

  const pagedSystemIds = pagedVehicles.map((v) => v.system_id);

  // Round 2: telemetry + alerts + Redis for this page only — all parallel
  const [telemetryRows, alertRows, ...redisResults] = await Promise.all([
    telemetryService.getVehicleTelemetry(pagedSystemIds, ALL_ELEMENT_IDS),
    diagnosticService.getActiveAlerts(pagedSystemIds),
    ...pagedSystemIds.map((id) => redisService.getVehicleModes(id)),
  ]);

  const telemetryMap = buildTelemetryMap(telemetryRows);
  const alertsMap    = buildAlertsMap(alertRows);

  const redisMap = {};
  pagedSystemIds.forEach((id, i) => { redisMap[id] = redisResults[i]; });

  const now = Date.now();

  const vehicles = pagedVehicles.map((vehicle) =>
    transformVehicle(vehicle, telemetryMap, alertsMap, redisMap[vehicle.system_id], now)
  );

  return { summary, pagination, vehicles };
};

module.exports = { getEolDashboard };
