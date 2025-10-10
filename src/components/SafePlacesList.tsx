import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { SafePlace } from '@/services/safePlacesService';

interface SafePlacesListProps {
  places: SafePlace[];
  userLocation?: { lat: number; lng: number };
}

export const SafePlacesList = ({ places, userLocation }: SafePlacesListProps) => {
  const openInGoogleMaps = (place: SafePlace) => {
    const url = `https://www.google.com/maps/dir/${userLocation?.lat},${userLocation?.lng}/${place.location.lat},${place.location.lng}`;
    window.open(url, '_blank');
  };

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'hospital': 
        return 'bg-red-100 text-red-700';
      case 'police station': 
        return 'bg-blue-100 text-blue-700';
      case 'fire station': 
        return 'bg-orange-100 text-orange-700';
      case 'open ground/park': 
      case 'park': 
        return 'bg-green-100 text-green-700';
      case 'stadium': 
        return 'bg-purple-100 text-purple-700';
      case 'school':
        return 'bg-yellow-100 text-yellow-700';
      case 'open area':
      case 'locality':
        return 'bg-teal-100 text-teal-700';
      default: 
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (places.length === 0) return null;

  return (
    <Card className="my-4 border-sky-200 shadow-md">
      <CardHeader className="bg-sky-50">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-sky-500" />
          Nearby Safe Locations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {places.map((place, index) => (
          <div 
            key={index} 
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 hover:shadow-sm transition-all"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sky-600 font-bold text-lg">{index + 1}.</span>
                  <h4 className="font-semibold text-gray-900">{place.name}</h4>
                </div>
                <p className="text-sm text-gray-600 mt-1 ml-7">{place.address}</p>
              </div>
              <Badge className={getTypeColor(place.type)}>
                {place.type}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between mt-3 ml-7">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1 font-medium">
                  <Navigation className="h-4 w-4 text-sky-500" />
                  {place.distance} km away
                </span>
                {place.rating && (
                  <span className="flex items-center gap-1">
                    ⭐ {place.rating}/5
                  </span>
                )}
              </div>
              
              {userLocation && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => openInGoogleMaps(place)}
                  className="text-sky-600 border-sky-300 hover:bg-sky-50 hover:border-sky-400"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Get Directions
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
