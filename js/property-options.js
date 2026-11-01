/* Choice lists for the extra rental details (same wording as Facebook Marketplace). */
(function (root) {
  "use strict";
  const FIELDS = {
    laundry_type: [["in_unit", "In-unit laundry"], ["in_building", "Laundry in building"], ["available", "Laundry available"], ["none", "None"]],
    parking_type: [["garage", "Garage parking"], ["street", "Street parking"], ["off_street", "Off-street parking"], ["available", "Parking available"], ["none", "None"]],
    ac_type: [["central", "Central AC"], ["available", "AC available"], ["none", "None"]],
    heating_type: [["central", "Central heating"], ["electric", "Electric heating"], ["gas", "Gas heating"], ["radiator", "Radiator heating"], ["available", "Heating available"], ["none", "None"]]
  };
  const label = (field, value) => {
    const m = (FIELDS[field] || []).find((x) => x[0] === value);
    return m ? m[1] : "";
  };
  root.PropertyOptions = { FIELDS, label };
})(window);
