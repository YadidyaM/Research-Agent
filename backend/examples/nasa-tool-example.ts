import { NASATool } from '../src/tools/NASATool';

// Example usage of the NASA API Tool
async function demonstrateNASATool() {
  // Initialize the NASA tool
  const nasaTool = new NASATool({
    apiKey: process.env.NASA_API_KEY, // Optional - will use DEMO_KEY if not provided
    timeout: 30000,
    userAgent: 'AI-Research-Agent/1.0'
  });

  console.log('🚀 NASA API Tool Demonstration\n');

  try {
    // 1. Get Astronomy Picture of the Day
    console.log('📸 Getting Astronomy Picture of the Day...');
    const apod = await nasaTool.execute({
      action: 'apod'
    });
    console.log(`Title: ${apod.title}`);
    console.log(`Date: ${apod.date}`);
    console.log(`Explanation: ${apod.explanation.substring(0, 100)}...`);
    console.log(`Image URL: ${apod.url}\n`);

    // 2. Get Mars rover photos
    console.log('🔴 Getting Mars Curiosity rover photos...');
    const marsPhotos = await nasaTool.execute({
      action: 'mars-photos',
      rover: 'curiosity',
      sol: 1000,
      maxResults: 3
    });
    console.log(`Found ${marsPhotos.photos.length} photos from Sol 1000`);
    if (marsPhotos.photos.length > 0) {
      console.log(`First photo: ${marsPhotos.photos[0].img_src}`);
      console.log(`Camera: ${marsPhotos.photos[0].camera.full_name}\n`);
    }

    // 3. Search NASA images
    console.log('🔍 Searching NASA image library...');
    const imageSearch = await nasaTool.execute({
      action: 'image-search',
      query: 'Mars surface',
      maxResults: 3
    });
    console.log(`Found ${imageSearch.total_hits} total images matching "Mars surface"`);
    if (imageSearch.results.length > 0) {
      console.log(`First result: ${imageSearch.results[0].title}`);
      console.log(`Description: ${imageSearch.results[0].description.substring(0, 100)}...\n`);
    }

    // 4. Get Near Earth Objects
    console.log('☄️ Getting Near Earth Objects...');
    const neos = await nasaTool.execute({
      action: 'neo-lookup',
      startDate: '2024-01-01',
      endDate: '2024-01-07'
    });
    console.log(`Found ${neos.element_count} Near Earth Objects`);
    const dates = Object.keys(neos.near_earth_objects);
    if (dates.length > 0 && neos.near_earth_objects[dates[0]].length > 0) {
      const firstNeo = neos.near_earth_objects[dates[0]][0];
      console.log(`Example NEO: ${firstNeo.name}`);
      console.log(`Potentially hazardous: ${firstNeo.is_potentially_hazardous_asteroid}\n`);
    }

    // 5. Get Earth imagery (example coordinates for New York City)
    console.log('🌍 Getting Earth imagery for New York City...');
    const earthImage = await nasaTool.execute({
      action: 'earth-imagery',
      lat: 40.7128,
      lon: -74.0060,
      date: '2023-01-01'
    });
    console.log(`Earth image URL: ${earthImage.url}\n`);

    // 6. Enhanced utility methods
    console.log('🎯 Using enhanced utility methods...');
    const astronomyPicture = await nasaTool.getAstronomyPictureWithExplanation();
    console.log(`Enhanced APOD: ${astronomyPicture.educational_summary}\n`);

    const spaceResearch = await nasaTool.getSpaceResearchSummary();
    console.log(`Space research summary: ${spaceResearch.summary}\n`);

    // 7. Tool health check
    const health = await nasaTool.health();
    console.log(`🔧 Tool health: ${health.status} (${health.responseTime}ms)`);
    console.log(`Endpoints status:`, health.endpoints);

    // 8. Tool metrics
    const metrics = await nasaTool.getToolMetrics();
    console.log(`📊 Tool metrics:`, metrics);

  } catch (error) {
    console.error('❌ Error during NASA API demonstration:', error);
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateNASATool();
}

export { demonstrateNASATool }; 