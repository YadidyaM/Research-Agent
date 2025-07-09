# 🚀 NASA API Integration for Research Agent

This document provides comprehensive information about the NASA API tool integration for the Research Agent application.

## 📋 Overview

The NASA API tool provides access to NASA's vast collection of space data, including:
- **Astronomy Picture of the Day (APOD)**
- **Mars Rover Photos** from Curiosity, Perseverance, Opportunity, and Spirit
- **NASA Image and Video Library** search
- **Near Earth Objects (NEO)** tracking
- **Earth Imagery** from space
- **Space Weather** and mission data

## 🔧 Setup Instructions

### 1. Get Your Free NASA API Key

1. Visit [https://api.nasa.gov/](https://api.nasa.gov/)
2. Click "Generate API Key"
3. Fill out the form with:
   - First Name
   - Last Name  
   - Email Address
4. Click "Signup"
5. Copy your API key from the confirmation page

### 2. Environment Configuration

Add the following variables to your `.env` file:

```bash
# NASA API Configuration
NASA_API_KEY=your_nasa_api_key_here
NASA_TIMEOUT=30000
NASA_USER_AGENT=AI-Research-Agent/1.0
```

**Note:** The tool will work with `DEMO_KEY` if no API key is provided, but with limited rate limits.

## 🎯 Available Actions

### 1. Astronomy Picture of the Day (APOD)

```typescript
// Get today's APOD
const result = await nasaTool.execute({
  action: 'apod'
});

// Get APOD for specific date
const result = await nasaTool.execute({
  action: 'apod',
  date: '2024-01-15'
});

// Get APOD for date range
const result = await nasaTool.execute({
  action: 'apod',
  startDate: '2024-01-01',
  endDate: '2024-01-07'
});
```

**Response:**
```typescript
{
  date: "2024-01-15",
  title: "The Orion Nebula",
  explanation: "This stunning view...",
  url: "https://apod.nasa.gov/apod/image/2401/OrionNebula_Webb.jpg",
  hdurl: "https://apod.nasa.gov/apod/image/2401/OrionNebula_Webb_4096.jpg",
  media_type: "image",
  copyright: "NASA, ESA, Webb Team"
}
```

### 2. Mars Rover Photos

```typescript
// Get Curiosity rover photos
const result = await nasaTool.execute({
  action: 'mars-photos',
  rover: 'curiosity',
  sol: 1000,        // Mars day
  camera: 'MAST',   // Optional: specific camera
  maxResults: 10
});

// Available rovers: 'curiosity', 'perseverance', 'opportunity', 'spirit'
// Available cameras: 'FHAZ', 'RHAZ', 'MAST', 'CHEMCAM', 'MAHLI', 'MARDI', 'NAVCAM'
```

**Response:**
```typescript
{
  photos: [
    {
      id: 424905,
      sol: 1000,
      camera: {
        name: "MAST",
        full_name: "Mast Camera"
      },
      img_src: "https://mars.nasa.gov/msl-raw-images/...",
      earth_date: "2015-05-30",
      rover: {
        name: "Curiosity",
        status: "active"
      }
    }
  ],
  rover_info: { ... }
}
```

### 3. NASA Image Library Search

```typescript
const result = await nasaTool.execute({
  action: 'image-search',
  query: 'Mars surface',
  mediaType: 'image',  // 'image', 'video', 'audio'
  maxResults: 20
});
```

**Response:**
```typescript
{
  query: "Mars surface",
  total_hits: 1234,
  results: [
    {
      nasa_id: "PIA12345",
      title: "Mars Surface Panorama",
      description: "This panoramic view...",
      date_created: "2023-12-15T00:00:00Z",
      keywords: ["Mars", "surface", "rover"],
      image_url: "https://images-api.nasa.gov/...",
      center: "JPL"
    }
  ]
}
```

### 4. Near Earth Objects (NEO)

```typescript
const result = await nasaTool.execute({
  action: 'neo-lookup',
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});
```

**Response:**
```typescript
{
  element_count: 5,
  near_earth_objects: {
    "2024-01-15": [
      {
        id: "54016849",
        name: "(2020 AP1)",
        is_potentially_hazardous_asteroid: false,
        estimated_diameter: {
          kilometers: {
            estimated_diameter_min: 0.0123,
            estimated_diameter_max: 0.0276
          }
        },
        close_approach_data: [
          {
            close_approach_date: "2024-01-15",
            relative_velocity: {
              kilometers_per_hour: "45123.456"
            },
            miss_distance: {
              kilometers: "1234567.89"
            }
          }
        ]
      }
    ]
  }
}
```

### 5. Earth Imagery

```typescript
const result = await nasaTool.execute({
  action: 'earth-imagery',
  lat: 40.7128,    // Latitude
  lon: -74.0060,   // Longitude  
  date: '2023-01-01'  // Optional
});
```

### 6. Asteroid Close Approaches

```typescript
const result = await nasaTool.execute({
  action: 'asteroid-approaches',
  dateMin: '2024-01-01',
  distMax: '0.05'  // Max distance in AU
});
```

## 🛠 Enhanced Utility Methods

The NASA tool also provides enhanced utility methods for common research tasks:

### Astronomy Picture with Educational Summary

```typescript
const result = await nasaTool.getAstronomyPictureWithExplanation('2024-01-15');
// Returns APOD data plus educational summary
```

### Mars Exploration Multi-Rover Search

```typescript
const result = await nasaTool.searchMarsExploration(1000, 'MAST');
// Returns data from multiple rovers for comparison
```

### Space Research Summary

```typescript
const result = await nasaTool.getSpaceResearchSummary('2024-01-01', '2024-01-07');
// Returns combined APOD + NEO data with summary
```

## 📊 Integration with Research Agent

### In Agent Orchestrator

```typescript
import { NASATool } from '../tools/NASATool';
import { getAgentConfig } from '../config';

const config = getAgentConfig();
const nasaTool = new NASATool({
  apiKey: config.tools.nasa.apiKey,
  timeout: config.tools.nasa.timeout,
  userAgent: config.tools.nasa.userAgent
});

// Use in agent workflow
const spaceData = await nasaTool.execute({
  action: 'apod'
});
```

### In LangChain Strategy

```typescript
// The NASA tool can be easily integrated into LangChain agents
// as a custom tool for space-related research tasks
```

## 🔍 Use Cases

### 1. Educational Content Creation
- Daily astronomy content for websites/apps
- Mars exploration educational materials  
- Space science research projects

### 2. Scientific Research
- Asteroid tracking and analysis
- Mars surface feature studies
- Earth observation data collection

### 3. Content and Media
- High-quality space imagery for articles
- Real-time space event tracking
- Scientific journalism research

### 4. Academic Applications
- Student research projects
- Space science curricula support
- STEM education resources

## ⚡ Performance & Rate Limits

### NASA API Rate Limits
- **With API Key:** 1,000 requests per hour
- **Demo Key:** 30 requests per hour, 50 requests per day
- **Tool Rate Limiting:** 1 request per second (built-in)

### Optimization Tips
1. **Cache Results:** Store APOD and static data locally
2. **Batch Requests:** Use date ranges for APOD queries
3. **Smart Filtering:** Use specific parameters to reduce response size
4. **Error Handling:** The tool includes automatic retry logic

## 🔧 Error Handling

The NASA tool includes comprehensive error handling:

```typescript
try {
  const result = await nasaTool.execute({ action: 'apod' });
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Handle rate limiting
  } else if (error.message.includes('API key')) {
    // Handle authentication issues
  } else {
    // Handle other errors
  }
}
```

## 🧪 Testing

Run the example demonstration:

```bash
cd Research-Agent/backend
npx ts-node examples/nasa-tool-example.ts
```

## 📈 Tool Metrics

Monitor tool usage:

```typescript
const metrics = nasaTool.getToolMetrics();
console.log(metrics);
// {
//   provider: 'NASA',
//   requestCount: 45,
//   supportsImagery: true,
//   supportsMarsData: true,
//   supportsAsteroids: true,
//   supportsEarthObservation: true,
//   requiresApiKey: true,
//   hasRateLimit: true
// }
```

## 🔍 Health Monitoring

Check tool health:

```typescript
const health = await nasaTool.health();
console.log(health);
// {
//   status: 'healthy',
//   responseTime: 345,
//   endpoints: { apod: true }
// }
```

## 🚨 Troubleshooting

### Common Issues

1. **"API key invalid"**
   - Verify your NASA API key is correct
   - Check the key hasn't expired
   - Ensure proper environment variable setup

2. **"Rate limit exceeded"**
   - You've exceeded the hourly request limit
   - Wait for the limit to reset
   - Consider caching responses

3. **"No data found"**
   - Check date formats (YYYY-MM-DD)
   - Verify rover names and cameras are correct
   - Some historical data may not be available

4. **"Network timeout"**
   - Increase timeout in configuration
   - Check internet connectivity
   - NASA APIs may be temporarily down

### Debug Mode

Enable verbose logging by setting:

```bash
DEBUG=nasa-tool
```

## 🔮 Future Enhancements

Potential additions to the NASA tool:

1. **NASA OSDR Integration** - Space biology research data
2. **Exoplanet Archive** - Confirmed exoplanet data  
3. **Space Weather APIs** - Solar storm and space weather data
4. **ISS Position Tracking** - Real-time ISS location
5. **Launch Schedule** - Upcoming NASA missions
6. **JWST Data** - James Webb Space Telescope observations

## 🤝 Contributing

To extend the NASA tool:

1. Add new action types to the execute method
2. Create corresponding private methods
3. Update TypeScript interfaces
4. Add examples and documentation
5. Include error handling and rate limiting

## 📚 Additional Resources

- [NASA API Documentation](https://api.nasa.gov/)
- [NASA Image and Video Library](https://images.nasa.gov/)
- [Mars Rover Photos API](https://github.com/chrisccerami/mars-photo-api)
- [Near Earth Object Web Service](https://cneos.jpl.nasa.gov/about/neo_groups.html)

---

**🚀 Happy space exploring with your Research Agent!** 