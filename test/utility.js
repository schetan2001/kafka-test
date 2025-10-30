function getNestedValue(obj, path) {
    if (!path || !obj) return undefined;
    
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

function filterData(dataArray, query, searchFields) {
    if (!dataArray || dataArray.length === 0 || !query || searchFields.length === 0) {
        return dataArray;
    }

    const lowerCaseQuery = String(query).toLowerCase();

    return dataArray.filter(item => {
        return searchFields.some(field => {
            const value = getNestedValue(item, field);

            if (value === null || value === undefined) {
                return false;
            }

            return String(value).toLowerCase().includes(lowerCaseQuery);
        });
    });
}

function sortData(dataArray, sortField, direction = 'asc') {
    if (!dataArray || dataArray.length < 2 || !sortField) {
        return dataArray;
    }

    const directionMultiplier = direction.toLowerCase() === 'asc' ? 1 : -1;

    return dataArray.slice().sort((a, b) => {
        const valA = getNestedValue(a, sortField);
        const valB = getNestedValue(b, sortField);

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
            return (numA - numB) * directionMultiplier;
        } else {
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();

            if (strA < strB) return -1 * directionMultiplier;
            if (strA > strB) return 1 * directionMultiplier;
            return 0;
        }
    });
}

module.exports = {
    filterData,
    sortData
};