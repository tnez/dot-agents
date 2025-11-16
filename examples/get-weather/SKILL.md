---
name: get-weather
description: Fetch and display current weather information for a specified location using wttr.in. Use when the user asks for weather conditions, forecasts, or temperature information.
license: MIT
---

# Get Weather

Fetch current weather information for any location using the wttr.in service.

## When to Use This Skill

Use this skill when:

- User asks for current weather conditions
- User requests temperature information
- User needs weather forecast
- User wants to know weather for a specific city or location
- User asks about meteorological conditions

## Process

### Step 1: Identify Location

Extract the location from the user's request:

- City name (e.g., "London", "New York")
- City with country (e.g., "Paris, France")
- Airport code (e.g., "LAX")
- Coordinates (e.g., "~Eiffel+Tower")

### Step 2: Fetch Weather Data

Use curl to fetch weather from wttr.in:

```bash
curl "wttr.in/LOCATION?format=j1"
```

The service returns JSON with:

- Current conditions
- Temperature (Celsius and Fahrenheit)
- Humidity
- Wind speed and direction
- Weather description
- Forecast data

### Step 3: Parse and Format Output

Extract relevant information:

1. Current temperature
2. Weather condition (sunny, cloudy, rainy, etc.)
3. Humidity percentage
4. Wind speed
5. "Feels like" temperature

### Step 4: Present Results

Display weather information in a clear format:

- Location name
- Current conditions
- Temperature (both C and F)
- Additional details (humidity, wind)
- Brief forecast if requested

## Examples

### Example 1: Simple Weather Query

**User Input**:
"What's the weather in Seattle?"

**Process**:

1. Extract location: "Seattle"
2. Fetch: `curl "wttr.in/Seattle?format=j1"`
3. Parse JSON response
4. Format output

**Expected Output**:

```text
Weather in Seattle:
Currently: Partly cloudy
Temperature: 15°C (59°F)
Feels like: 13°C (55°F)
Humidity: 65%
Wind: 10 km/h NW
```

### Example 2: International Location

**User Input**:
"How's the weather in Tokyo, Japan?"

**Process**:

1. Extract location: "Tokyo"
2. Fetch: `curl "wttr.in/Tokyo?format=j1"`
3. Parse response
4. Format for display

**Expected Output**:

```text
Weather in Tokyo:
Currently: Clear
Temperature: 22°C (72°F)
Feels like: 22°C (72°F)
Humidity: 45%
Wind: 15 km/h E
```

### Example 3: Weather with Forecast

**User Input**:
"What's the weather going to be like in Miami tomorrow?"

**Process**:

1. Extract location: "Miami"
2. Fetch: `curl "wttr.in/Miami?format=j1"`
3. Parse current and forecast data
4. Present both current and tomorrow's forecast

**Expected Output**:

```text
Current Weather in Miami:
Currently: Sunny
Temperature: 28°C (82°F)
Feels like: 31°C (88°F)
Humidity: 70%
Wind: 12 km/h SE

Tomorrow's Forecast:
High: 29°C (84°F)
Low: 24°C (75°F)
Condition: Partly cloudy
Chance of rain: 20%
```

## Best Practices

- Always include both Celsius and Fahrenheit for temperature
- Handle location variations (abbreviations, alternate spellings)
- Provide "feels like" temperature when available
- Include humidity and wind for complete picture
- Use clear, readable formatting
- Handle errors gracefully (invalid locations, network issues)

## Common Pitfalls

- **Ambiguous locations**: "Paris" could be Paris, France or Paris, Texas. Ask for clarification or default to most common.
- **Invalid locations**: Service may not recognize very small towns. Suggest nearby major city.
- **Network failures**: If wttr.in is unavailable, inform user and suggest trying again later.
- **Encoding issues**: Replace spaces with `+` in URLs (e.g., "New York" → "New+York")

## Dependencies

- `curl` command-line tool
- Internet connection
- wttr.in service availability

## API Details

wttr.in URL formats:

- JSON output: `wttr.in/LOCATION?format=j1`
- Plain text: `wttr.in/LOCATION`
- Weather codes: `wttr.in/LOCATION?format=%C+%t`

No API key required. Free service with reasonable rate limits.

## Error Handling

**Location Not Found**:

```text
Error: Could not find location "Xyz123"
Please check spelling or try a nearby major city.
```

**Network Error**:

```text
Error: Unable to fetch weather data
Please check your internet connection and try again.
```

**Service Unavailable**:

```text
Error: Weather service temporarily unavailable
Please try again in a few moments.
```
