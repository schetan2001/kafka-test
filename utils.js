const searchInData = (data, searchQuery, keys) => {
  if (!searchQuery || !Array.isArray(data)) return data;
  
  const search = searchQuery.toLowerCase();
  return data.filter(item => {
    return keys.some(key => {
      const value = item[key];
      return value && value.toString().toLowerCase().includes(search);
    });
  });
};

module.exports = { searchInData };