import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import ExploreScreen from './src/screens/Explore/ExploreScreen';
import WishlistScreen from './src/screens/Wishlist/WishlistScreen';
import CalendarScreen from './src/screens/Calendar/CalendarScreen';
import ProfileScreen from './src/screens/Profile/ProfileScreen';
import BusinessScreen from './src/screens/Business/BusinessScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Explore" component={ExploreScreen} />
        <Tab.Screen name="Wishlist" component={WishlistScreen} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
        <Tab.Screen name="Business" component={BusinessScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}