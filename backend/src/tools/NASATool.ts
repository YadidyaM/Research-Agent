import { Tool } from '../types';
import axios from 'axios';

interface NASAConfig {
  apiKey?: string;
  timeout?: number;
  userAgent?: string;
  maxRetries?: number;
}

interface APODResult {
  date: string;
  explanation: string;
  hdurl?: string;
  media_type: string;
  service_version: string;
  title: string;
  url: string;
  copyright?: string;
}

interface MarsPhotoResult {
  id: number;
  sol: number;
  camera: {
    id: number;
    name: string;
    rover_id: number;
    full_name: string;
  };
  img_src: string;
  earth_date: string;
  rover: {
    id: number;
    name: string;
    landing_date: string;
    launch_date: string;
    status: string;
  };
}

interface NEOResult {
  id: string;
  neo_reference_id: string;
  name: string;
  nasa_jpl_url: string;
  absolute_magnitude_h: number;
  estimated_diameter: {
    kilometers: {
      estimated_diameter_min: number;
      estimated_diameter_max: number;
    };
    meters: {
      estimated_diameter_min: number;
      estimated_diameter_max: number;
    };
  };
  is_potentially_hazardous_asteroid: boolean;
  close_approach_data: Array<{
    close_approach_date: string;
    close_approach_date_full: string;
    epoch_date_close_approach: number;
    relative_velocity: {
      kilometers_per_second: string;
      kilometers_per_hour: string;
      miles_per_hour: string;
    };
    miss_distance: {
      astronomical: string;
      lunar: string;
      kilometers: string;
      miles: string;
    };
    orbiting_body: string;
  }>;
}

interface EarthImageryResult {
  date: string;
  url: string;
  id: string;
}

interface NASAImageSearchResult {
  collection: {
    version: string;
    href: string;
    items: Array<{
      href: string;
      data: Array<{
        center: string;
        title: string;
        nasa_id: string;
        date_created: string;
        keywords?: string[];
        media_type: string;
        description: string;
        location?: string;
        photographer?: string;
      }>;
      links?: Array<{
        href: string;
        rel: string;
        render?: string;
      }>;
    }>;
    metadata: {
      total_hits: number;
    };
  };
}

export class NASATool implements Tool {
  name = 'nasa_api';
  description = 'Access NASA APIs for space data, astronomy images, Mars rover photos, asteroids, and scientific research data';
  private config: NASAConfig;
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly baseUrl = 'https://api.nasa.gov';
  private readonly imageSearchUrl = 'https://images-api.nasa.gov';

  constructor(config: NASAConfig = {}) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      userAgent: 'AI-Research-Agent/1.0',
      ...config,
    };
  }

  async execute(input: {
    action: 'apod' | 'mars-photos' | 'neo-lookup' | 'earth-imagery' | 'image-search' | 'mars-weather' | 'asteroid-approaches';
    date?: string;
    startDate?: string;
    endDate?: string;
    rover?: 'curiosity' | 'opportunity' | 'spirit' | 'perseverance';
    sol?: number;
    camera?: string;
    lat?: number;
    lon?: number;
    query?: string;
    mediaType?: 'image' | 'video' | 'audio';
    maxResults?: number;
    yearStart?: string;
    monthStart?: string;
    dayStart?: string;
    distMax?: string;
    dateMin?: string;
  }): Promise<any> {
    const {
      action,
      date,
      startDate,
      endDate,
      rover = 'curiosity',
      sol,
      camera,
      lat,
      lon,
      query,
      mediaType = 'image',
      maxResults = 10,
      yearStart,
      monthStart,
      dayStart,
      distMax,
      dateMin
    } = input;

    // Rate limiting
    await this.enforceRateLimit();

    let attempt = 0;
    while (attempt < this.config.maxRetries!) {
      try {
        switch (action) {
          case 'apod':
            return await this.getAPOD(date, startDate, endDate);
          
          case 'mars-photos':
            return await this.getMarsPhotos(rover, sol, camera, maxResults);
          
          case 'neo-lookup':
            return await this.getNearEarthObjects(startDate, endDate);
          
          case 'earth-imagery':
            if (!lat || !lon) throw new Error('Latitude and longitude are required for earth imagery');
            return await this.getEarthImagery(lat, lon, date);
          
          case 'image-search':
            if (!query) throw new Error('Query is required for image search');
            return await this.searchNASAImages(query, mediaType, maxResults);
          
          case 'mars-weather':
            return await this.getMarsWeather();
          
          case 'asteroid-approaches':
            return await this.getAsteroidApproaches(dateMin, distMax);
          
          default:
            throw new Error(`Unsupported action: ${action}`);
        }
      } catch (error) {
        attempt++;
        if (attempt >= this.config.maxRetries!) {
          console.error(`NASA API failed after ${this.config.maxRetries} attempts:`, error);
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new Error('NASA API request failed after all retries');
  }

  private async getAPOD(date?: string, startDate?: string, endDate?: string): Promise<APODResult | APODResult[]> {
    const endpoint = '/planetary/apod';
    const params: any = {
      api_key: this.config.apiKey || 'DEMO_KEY'
    };

    if (date) {
      params.date = date;
    } else if (startDate && endDate) {
      params.start_date = startDate;
      params.end_date = endDate;
    }

    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
      params,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`NASA APOD API failed with status: ${response.status}`);
    }

    return response.data;
  }

  private async getMarsPhotos(rover: string, sol?: number, camera?: string, maxResults: number = 10): Promise<{
    photos: MarsPhotoResult[];
    rover_info: any;
  }> {
    const endpoint = `/mars-photos/api/v1/rovers/${rover}/photos`;
    const params: any = {
      api_key: this.config.apiKey || 'DEMO_KEY',
      page: 1
    };

    if (sol) {
      params.sol = sol;
    } else {
      // Default to latest sol with photos
      params.sol = 1000;
    }

    if (camera) {
      params.camera = camera;
    }

    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
      params,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`NASA Mars Photos API failed with status: ${response.status}`);
    }

    const photos = response.data.photos.slice(0, maxResults);
    
    return {
      photos,
      rover_info: photos.length > 0 ? photos[0].rover : null
    };
  }

  private async getNearEarthObjects(startDate?: string, endDate?: string): Promise<{
    element_count: number;
    near_earth_objects: Record<string, NEOResult[]>;
  }> {
    const endpoint = '/neo/rest/v1/feed';
    const params: any = {
      api_key: this.config.apiKey || 'DEMO_KEY'
    };

    if (startDate) {
      params.start_date = startDate;
    }
    if (endDate) {
      params.end_date = endDate;
    }

    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
      params,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`NASA NEO API failed with status: ${response.status}`);
    }

    return response.data;
  }

  private async getEarthImagery(lat: number, lon: number, date?: string): Promise<EarthImageryResult> {
    const endpoint = '/planetary/earth/imagery';
    const params: any = {
      lon: lon.toString(),
      lat: lat.toString(),
      api_key: this.config.apiKey || 'DEMO_KEY'
    };

    if (date) {
      params.date = date;
    }

    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
      params,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`NASA Earth Imagery API failed with status: ${response.status}`);
    }

    return {
      date: params.date || 'latest',
      url: response.request.responseURL,
      id: `earth_${lat}_${lon}_${params.date || 'latest'}`
    };
  }

  private async searchNASAImages(query: string, mediaType: string = 'image', maxResults: number = 10): Promise<{
    query: string;
    total_hits: number;
    results: Array<{
      nasa_id: string;
      title: string;
      description: string;
      date_created: string;
      media_type: string;
      keywords: string[];
      image_url?: string;
      center: string;
      location?: string;
      photographer?: string;
    }>;
  }> {
    const endpoint = '/search';
    const params = {
      q: query,
      media_type: mediaType,
      page_size: Math.min(maxResults, 100)
    };

    const response = await axios.get(`${this.imageSearchUrl}${endpoint}`, {
      params,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`NASA Image Search API failed with status: ${response.status}`);
    }

    const data: NASAImageSearchResult = response.data;
    
    const results = data.collection.items.map(item => ({
      nasa_id: item.data[0].nasa_id,
      title: item.data[0].title,
      description: item.data[0].description,
      date_created: item.data[0].date_created,
      media_type: item.data[0].media_type,
      keywords: item.data[0].keywords || [],
      image_url: item.links?.[0]?.href,
      center: item.data[0].center,
      location: item.data[0].location,
      photographer: item.data[0].photographer,
    }));

    return {
      query,
      total_hits: data.collection.metadata.total_hits,
      results: results.slice(0, maxResults)
    };
  }

  private async getMarsWeather(): Promise<any> {
    // Note: InSight mission ended, but keeping this for potential future Mars weather APIs
    const endpoint = '/insight_weather/';
    const params = {
      api_key: this.config.apiKey || 'DEMO_KEY',
      feedtype: 'json',
      ver: '1.0'
    };

    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: {
          'User-Agent': this.config.userAgent,
        },
        timeout: this.config.timeout,
      });

      return response.data;
    } catch (error) {
      // Fallback message if InSight data is no longer available
      return {
        status: 'unavailable',
        message: 'Mars weather data from InSight mission is no longer available. Mission ended in December 2022.',
        alternative: 'Consider using Mars rover environmental data from recent missions.'
      };
    }
  }

  private async getAsteroidApproaches(dateMin?: string, distMax?: string): Promise<any> {
    // This would integrate with NASA's CNEOS API
    // For now, we'll use the main NASA API NEO endpoint with filtering
    const neoData = await this.getNearEarthObjects(dateMin);
    
    if (distMax) {
      // Filter by distance if specified
      const filteredData = { ...neoData };
      Object.keys(filteredData.near_earth_objects).forEach(date => {
        filteredData.near_earth_objects[date] = filteredData.near_earth_objects[date].filter(neo => 
          neo.close_approach_data.some(approach => 
            parseFloat(approach.miss_distance.astronomical) <= parseFloat(distMax)
          )
        );
      });
      return filteredData;
    }
    
    return neoData;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000; // 1 second between requests

    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  // Utility methods for enhanced functionality
  async getAstronomyPictureWithExplanation(date?: string): Promise<{
    image: APODResult;
    educational_summary: string;
  }> {
    const apod = await this.getAPOD(date) as APODResult;
    
    return {
      image: apod,
      educational_summary: `This is NASA's Astronomy Picture of the Day for ${apod.date}. ${apod.explanation.substring(0, 200)}...`
    };
  }

  async searchMarsExploration(sol?: number, camera?: string): Promise<{
    curiosity?: any;
    perseverance?: any;
    summary: string;
  }> {
    const results: any = { summary: '' };
    
    try {
      const curiosityPhotos = await this.getMarsPhotos('curiosity', sol, camera, 5);
      results.curiosity = curiosityPhotos;
    } catch (error) {
      console.log('Curiosity data unavailable:', error);
    }

    try {
      const perseverancePhotos = await this.getMarsPhotos('perseverance', sol, camera, 5);
      results.perseverance = perseverancePhotos;
    } catch (error) {
      console.log('Perseverance data unavailable:', error);
    }

    results.summary = `Mars exploration data for Sol ${sol || 'latest'}. Retrieved photos from available rovers.`;
    return results;
  }

  async getSpaceResearchSummary(startDate?: string, endDate?: string): Promise<{
    apod: APODResult;
    near_earth_objects: any;
    summary: string;
  }> {
    const [apod, neos] = await Promise.all([
      this.getAPOD(),
      this.getNearEarthObjects(startDate, endDate)
    ]);

    return {
      apod: apod as APODResult,
      near_earth_objects: neos,
      summary: `Space research summary: Today's astronomy picture and ${neos.element_count} near-Earth objects tracked.`
    };
  }

  getToolMetrics(): {
    provider: string;
    requestCount: number;
    supportsImagery: boolean;
    supportsMarsData: boolean;
    supportsAsteroids: boolean;
    supportsEarthObservation: boolean;
    requiresApiKey: boolean;
    hasRateLimit: boolean;
  } {
    return {
      provider: 'NASA',
      requestCount: this.requestCount,
      supportsImagery: true,
      supportsMarsData: true,
      supportsAsteroids: true,
      supportsEarthObservation: true,
      requiresApiKey: !!this.config.apiKey,
      hasRateLimit: true,
    };
  }

  async health(): Promise<{
    status: string;
    responseTime: number;
    endpoints: Record<string, boolean>;
  }> {
    const startTime = Date.now();
    const endpoints: Record<string, boolean> = {};

    try {
      await this.getAPOD();
      endpoints.apod = true;
    } catch {
      endpoints.apod = false;
    }

    return {
      status: endpoints.apod ? 'healthy' : 'degraded',
      responseTime: Date.now() - startTime,
      endpoints
    };
  }
} 