import { WeatherInfo } from "../types";

const API_URL = ""; // Relative to origin

export async function fetchWeather(lat: number, lon: number): Promise<WeatherInfo | null> {
  try {
    const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (!response.ok) throw new Error("Failed to fetch weather from proxy");
    return await response.json();
  } catch (error) {
    // Silently continue without weather data on connection issues
    return null;
  }
}

export async function getAppointmentWeather(lat: number, lon: number, timestamp: number): Promise<{
  temp: number;
  condition: string;
  rainProbability: number;
  description: string;
} | null> {
  try {
    const response = await fetch(`/api/weather/appointment?lat=${lat}&lon=${lon}&timestamp=${timestamp}`);
    if (!response.ok) throw new Error("Failed to fetch appointment weather from proxy");
    return await response.json();
  } catch (error) {
    // Silently continue without weather data on connection issues
    return null;
  }
}
