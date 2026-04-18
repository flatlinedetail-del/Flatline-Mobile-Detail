import { WeatherInfo } from "../types";

const OPENWEATHER_API_KEY = process.env.VITE_OPENWEATHER_API_KEY;

export async function fetchWeather(lat: number, lon: number): Promise<WeatherInfo | null> {
  if (!OPENWEATHER_API_KEY) {
    console.warn("OpenWeather API key is missing. Weather features will be limited.");
    return null;
  }

  try {
    // Fetch current weather and forecast
    // Using 5 day / 3 hour forecast as it's free
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=imperial`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=imperial`)
    ]);

    if (!currentRes.ok || !forecastRes.ok) {
      throw new Error("Failed to fetch weather data");
    }

    const currentData = await currentRes.json();
    const forecastData = await forecastRes.json();

    // Process forecast to get daily summaries
    const dailyForecasts: any[] = [];
    const seenDates = new Set();

    forecastData.list.forEach((item: any) => {
      const date = new Date(item.dt * 1000).toLocaleDateString();
      if (!seenDates.has(date) && dailyForecasts.length < 7) {
        seenDates.add(date);
        dailyForecasts.push({
          date,
          temp: {
            min: item.main.temp_min,
            max: item.main.temp_max
          },
          condition: item.weather[0].main,
          description: item.weather[0].description
        });
      }
    });

    // Generate business guidance based on weather
    const condition = currentData.weather[0].main.toLowerCase();
    const temp = currentData.main.temp;
    let businessGuidance = "";

    if (condition.includes("rain") || condition.includes("drizzle")) {
      businessGuidance = "Rain detected. Pivot to interior detailing, odor removal, and mold prevention services. Push maintenance reminders for existing clients.";
    } else if (condition.includes("clear") || condition.includes("sun")) {
      businessGuidance = "Clear skies. Perfect for exterior washes, ceramic coatings, and high-gloss wax packages. Promote premium shine services.";
    } else if (temp < 40) {
      businessGuidance = "Cold snap. Focus on interior protection and winter prep packages. Great time for salt removal and undercarriage protection.";
    } else if (temp > 85) {
      businessGuidance = "High heat. Promote UV protection for interiors and ceramic coatings to protect paint from sun damage. Cabin comfort refresh is a must.";
    } else {
      businessGuidance = "Moderate weather. Ideal for full details and multi-stage paint correction. Push your most popular all-in-one packages.";
    }

    return {
      current: {
        temp: Math.round(temp),
        condition: currentData.weather[0].main,
        icon: currentData.weather[0].icon,
        description: currentData.weather[0].description
      },
      forecast: dailyForecasts,
      businessGuidance
    };
  } catch (error) {
    console.error("Error fetching weather:", error);
    return null;
  }
}
