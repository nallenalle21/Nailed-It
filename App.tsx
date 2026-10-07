import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/services/supabase';

import WorkLocations from './src/screens/Profile/Business/WorkLocations';
import LoginScreen from './src/screens/Login/LoginScreen';
import Certificates from './src/screens/Profile/Business/Certificates';
import Bookkeeping from './src/screens/Profile/Business/Bookkeeping';

import ExploreCreator from './src/screens/Explore/ExploreCreator';
import WishlistCreator from './src/screens/Wishlist/WishlistCreator';
import CalendarCreator from './src/screens/Calendar/CalendarCreator';
import ChatsCreator from './src/screens/Chats/ChatsCreator';
import ProfileCreator from './src/screens/Profile/ProfileCreator';
import BusinessCreator from './src/screens/Profile/BusinessCreator';
import ServicesAndPrices from './src/screens/Profile/Business/ServicesAndPrices';

import ExploreUser from './src/screens/Explore/ExploreUser';
import WishlistUser from './src/screens/Wishlist/WishlistUser';
import CalendarUser from './src/screens/Calendar/CalendarUser';
import ChatsUser from './src/screens/Chats/ChatsUser';
import ProfileUser from './src/screens/Profile/ProfileUser';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const getIcon = (name: string, focused: boolean) => {
  const icons: any = {
    Explore: focused ? 'compass' : 'compass-outline',
    Wishlist: focused ? 'heart' : 'heart-outline',
    Calendar: focused ? 'calendar' : 'calendar-outline',
    Chats: focused ? 'chatbubbles' : 'chatbubbles-outline',
    Profile: focused ? 'person' : 'person-outline',
  };
  return icons[name] || 'circle';
};

function CreatorTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => <Ionicons name={getIcon(route.name, focused)} size={size} color={color} />,
      tabBarActiveTintColor: 'tomato', tabBarInactiveTintColor: 'gray',
    })}>
      <Tab.Screen name="Explore" component={ExploreCreator} />
      <Tab.Screen name="Wishlist" component={WishlistCreator} />
      <Tab.Screen name="Calendar" component={CalendarCreator} />
      <Tab.Screen name="Chats" component={ChatsCreator} />
      <Tab.Screen name="Profile" component={ProfileCreator} />
    </Tab.Navigator>
  );
}

function UserTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => <Ionicons name={getIcon(route.name, focused)} size={size} color={color} />,
      tabBarActiveTintColor: 'tomato', tabBarInactiveTintColor: 'gray',
    })}>
      <Tab.Screen name="Explore" component={ExploreUser} />
      <Tab.Screen name="Wishlist" component={WishlistUser} />
      <Tab.Screen name="Calendar" component={CalendarUser} />
      <Tab.Screen name="Chats" component={ChatsUser} />
      <Tab.Screen name="Profile" component={ProfileUser} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
    setRole(data?.role || 'user');
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchRole(session.user.id);
      else setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchRole(session.user.id);
      else setRole(null);
    });
  }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" /></View>;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : role === 'creator' ? (
          <Stack.Group>
            <Stack.Screen name="CreatorTabs" component={CreatorTabs} />
            <Stack.Screen name="BusinessCreator" component={BusinessCreator} />
            <Stack.Screen name="ServicesAndPrices" component={ServicesAndPrices} />
            <Stack.Screen name="WorkLocations" component={WorkLocations} />
            <Stack.Screen name="Certificates" component={Certificates} />
            <Stack.Screen name="Bookkeeping" component={Bookkeeping} />
          </Stack.Group>
        ) : (
          <Stack.Screen name="UserTabs" component={UserTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}