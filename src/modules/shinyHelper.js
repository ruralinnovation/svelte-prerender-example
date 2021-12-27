// Shiny Helper functions

export function setInput (input, value) {
    if (typeof Shiny !== "undefined" && typeof Shiny.setInputValue === "function") {
        console.log('Shiny.setInputValue("', input, '", "', value, '")');
        Shiny.setInputValue(input, value);                          // simple value update; no event for same value
        Shiny.setInputValue(input, value, {priority: "event"});// value update with "event" priority for observeEvent
    }
}

