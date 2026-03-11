    # DTC Dashboard API Documentation

    **Version:** 1.0.0
    **Base URL:** `http://localhost:4000/graphql`
    **Protocol:** GraphQL over HTTP (POST)

    ---

    ## 1. Overview

    This API provides data for the Vehicle Diagnostic Dashboard. It supports filtering by **Vehicle (System ID)** and **ECU Type** across all major dashboard panels.

    ### Common Arguments

    Most queries accept these optional filter arguments:

    | Argument | Type | Description |
    | :--- | :--- | :--- |
    | `system_id` | `String` | Filter by Vehicle Identifier (e.g., VIN). |
    | `ecu_type` | `String` | Filter by ECU (e.g., "ABS", "BMS", "VCU"). |

    ---

    ## 2. Dashboard Queries

    ### 2.1 DTC Count by ECU (Bar Chart)
    Fetches DTC counts grouped by ECU type, split into **Active** and **History**.

    **Query:**
    ```graphql
    query GetDtcCount($system_id: String) {
    dtcCountByEcu(system_id: $system_id) {
        ecu_type
        active_count
        history_count
    }
    }
    ```

    **Response Field:** `dtcCountByEcu: [DtcCountByEcu!]!`

    | Field | Type | Description |
    | :--- | :--- | :--- |
    | `ecu_type` | `String!` | The ECU type (e.g., "bms"). |
    | `active_count` | `Int!` | Count of currently active DTCs (`status = 'OPEN'`). |
    | `history_count` | `Int!` | Count of historical DTCs (`status != 'OPEN'`). |

    ---

    ### 2.2 Severity Distribution (Donut Chart)
    Fetches the percentage distribution of DTCs by severity level (G1, G2, etc.).

    **Query:**
    ```graphql
    query GetSeverityDist($system_id: String, $ecu_type: String) {
    dtcDistributionBySeverity(system_id: $system_id, ecu_type: $ecu_type) {
        severity
        count
        percentage
    }
    }
    ```

    **Response Field:** `dtcDistributionBySeverity: [SeverityDistribution!]!`

    | Field | Type | Description |
    | :--- | :--- | :--- |
    | `severity` | `String!` | Severity level (e.g., "G1", "G2"). |
    | `count` | `Int!` | Absolute count of DTCs. |
    | `percentage` | `Float!` | Percentage of total (0-100). |

    ---

    ### 2.3 Status Distribution (Pie Chart)
    Fetches the percentage distribution of Active vs. Inactive DTCs.

    **Query:**
    ```graphql
    query GetStatusDist($system_id: String, $ecu_type: String) {
    dtcDistributionByStatus(system_id: $system_id, ecu_type: $ecu_type) {
        status
        count
        percentage
    }
    }
    ```

    **Response Field:** `dtcDistributionByStatus: [StatusDistribution!]!`

    | Field | Type | Description |
    | :--- | :--- | :--- |
    | `status` | `String!` | "Active" or "Inactive". |
    | `count` | `Int!` | Absolute count. |
    | `percentage` | `Float!` | Percentage of total. |

    ---

    ### 2.4 Recoverability Stats (Pie Chart)
    Fetches stats on recoverable vs. non-recoverable DTCs based on the master definition.

    **Query:**
    ```graphql
    query GetRecoverability($system_id: String, $ecu_type: String) {
    recoverabilityStats(system_id: $system_id, ecu_type: $ecu_type) {
        total
        recoverable_count
        non_recoverable_count
        recoverable_percentage
        non_recoverable_percentage
    }
    }
    ```

    **Response Field:** `recoverabilityStats: RecoverabilityStats!`

    | Field | Type | Description |
    | :--- | :--- | :--- |
    | `total` | `Int!` | Total DTC occurrences matching filters. |
    | `recoverable_count` | `Int!` | Count where `master.recoverable = true`. |
    | `non_recoverable_count` | `Int!` | Count where `master.recoverable = false` or `null`. |
    | `recoverable_percentage` | `Float!` | Percentage of recoverable (0-100). |
    | `non_recoverable_percentage` | `Float!` | Percentage of non-recoverable (0-100). |

    ---

    ## 3. Detailed Data Queries

    ### 3.1 DTC Occurrences List (Table)
    Fetches a paginated list of individual DTC occurrence records.

    **Query:**
    ```graphql
    query GetDtcList(
    $system_id: String
    $ecu_type: String
    $limit: Int
    $offset: Int
    ) {
    dtcOccurrences(
        system_id: $system_id
        ecu_type: $ecu_type
        limit: $limit
        offset: $offset
    ) {
        total_count
        data {
        id
        dtc_code
        description
        status
        severity
        first_triggered_at
        last_triggered_at
        occurrence_count
        ecu_type
        }
    }
    }
    ```

    **Response Field:** `dtcOccurrences: DtcOccurrenceResult!`

    | Field | Type | Description |
    | :--- | :--- | :--- |
    | `total_count` | `Int!` | Total number of records matching filters (for pagination). |
    | `data` | `[DtcOccurrence!]!` | List of occurrence objects. |

    **DtcOccurrence Object:**
    - `id`: `ID!`
    - `dtc_code`: `String`
    - `description`: `String` (from joined master)
    - `ecu_type`: `String`
    - `status`: `String`
    - `severity`: `String`
    - `first_triggered_at`: `String` (ISO Date)
    - `last_triggered_at`: `String` (ISO Date)
    - `occurrence_count`: `Int`
    - `can_data`: `String` (JSON serialized)

    ---

    ### 3.2 Total DTC Count
    Fetches a simple integer count of DTCs.

    **Query:**
    ```graphql
    query GetTotalCount($ecu_type: String, $status: String, $severity: String) {
    totalDtcCount(ecu_type: $ecu_type, status: $status, severity: $severity)
    }
    ```

    **Response Field:** `totalDtcCount: Int!`

    ---
