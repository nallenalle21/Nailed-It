import { GestureHandlerRootView } from 'react-native-gesture-handler'; // must stay the very first import
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { supabase } from './src/services/supabase';
import FloatingTabBar from './src/components/FloatingTabBar';
import {
  clearBookingReminders,
  configureNotifications,
  isBookingReminder,
  syncBookingReminders,
} from './src/services/reminders';

import ChatRoom from './src/screens/Chats/ChatRoom';
import CustomerProfile from './src/screens/Chats/ChatCustomerProfile';

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
import VendorDirectory from './src/screens/Explore/VendorDirectory';
import VendorProfile from './src/screens/Explore/VendorProfile';
import WishlistUser from './src/screens/Wishlist/WishlistUser';
import CalendarUser from './src/screens/Calendar/CalendarUser';
import ChatsUser from './src/screens/Chats/ChatsUser';
import ProfileUser from './src/screens/Profile/ProfileUser';
import Settings from './src/screens/Profile/Settings';
import Insights from './src/screens/Profile/Business/Insights';
import FreelancerOnboarding from './src/screens/Onboarding/FreelancerOnboarding';
import AboutEdit from './src/screens/Profile/Edit/AboutEdit';
import PauseEdit from './src/screens/Profile/Edit/PauseEdit';
import OffersEdit from './src/screens/Profile/Edit/OffersEdit';
import AccessibilityEdit from './src/screens/Profile/Edit/AccessibilityEdit';
import ScheduleEdit from './src/screens/Profile/Edit/ScheduleEdit';
import BookingRulesEdit from './src/screens/Profile/Edit/BookingRulesEdit';
import NotificationsEdit from './src/screens/Profile/Edit/NotificationsEdit';
import FAQ from './src/screens/Profile/FAQ';
import Terms from './src/screens/Profile/Terms';
import HowItWorks from './src/screens/Profile/HowItWorks';
import AccountSettings from './src/screens/Profile/AccountSettings';
import ExplorePreferences from './src/screens/Profile/ExplorePreferences';


const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<any>();

// Booking reminders show as a banner even while the app is open.
configureNotifications();

// Bottom menu: floating Instagram-style bar (src/components/FloatingTabBar.tsx) with HORIZON labels.
const renderTabBar = (props: BottomTabBarProps) => <FloatingTabBar {...props} />;
const Stack = createNativeStackNavigator();

const getIcon = (name: string, focused: boolean) => {
  const icons: any = {
    Explore: focused ? 'compass' : 'compass-outline',
    Wishlist: focused ? 'heart' : 'heart-outline',
    Calendar: focused ? 'calendar' : 'calendar-outline',
    Chats: focused ? 'chatbubbles' : 'chatbubbles-outline',
    Profile: focused ? 'person' : 'person-outline',
    Vendors: focused ? 'people' : 'people-outline',
  };
  return icons[name] || 'circle';
};

// Nest the public vendor profile inside the Vendors tab so the bottom tabs
// stay mounted (and visible) while browsing a creator's profile.
function VendorsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VendorDirectory" component={VendorDirectory} />
      <Stack.Screen name="VendorProfile" component={VendorProfile} />
    </Stack.Navigator>
  );
}

function CreatorTabs() {
  return (
    <Tab.Navigator backBehavior="history" tabBar={renderTabBar} screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => <Ionicons name={getIcon(route.name, focused)} size={size} color={color} />,
    })}>
      <Tab.Screen name="Explore" component={ExploreCreator} />
      <Tab.Screen name="Vendors" component={VendorsStack} options={{tabBarButton: () => null, tabBarItemStyle: { display: 'none' },}}/>
      <Tab.Screen name="Wishlist" component={WishlistCreator} options={{ tabBarLabel: 'Inspiration' }} />
      <Tab.Screen name="Calendar" component={CalendarCreator} />
      <Tab.Screen name="Chats" component={ChatsCreator} />
      <Tab.Screen name="Profile" component={ProfileCreator} />
    </Tab.Navigator>
  );
}

function UserTabs() {
  return (
    <Tab.Navigator backBehavior="history" tabBar={renderTabBar} screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => <Ionicons name={getIcon(route.name, focused)} size={size} color={color} />,
    })}>
      <Tab.Screen name="Explore" component={ExploreUser} />
      <Tab.Screen name="Vendors" component={VendorsStack} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tab.Screen name="Wishlist" component={WishlistUser} options={{ tabBarLabel: 'Inspiration' }} />
      <Tab.Screen name="Calendar" component={CalendarUser} />
      <Tab.Screen name="Chats" component={ChatsUser} />
      <Tab.Screen name="Profile" component={ProfileUser} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  // Freelancers start in the onboarding until their profile is live (all required steps done).
  const [creatorLive, setCreatorLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fontsLoaded] = useFonts({
    Horizon: require('./assets/fonts/Horizon.otf'),
    'GlacialIndifference-Regular': require('./assets/fonts/GlacialIndifference-Regular.otf'),
    'GlacialIndifference-Bold': require('./assets/fonts/GlacialIndifference-Bold.otf'),
  });

  const fetchRole = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('role, is_live').eq('id', userId).single();
    setRole(data?.role || 'user');
    setCreatorLive(data?.is_live ?? true);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchRole(session.user.id);
      else setLoading(false);
    });

    supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) fetchRole(session.user.id);
      else setRole(null);
      // Someone else might log in on this phone next: don't keep this user's reminders.
      if (event === 'SIGNED_OUT') void clearBookingReminders();
    });
  }, []);

  // Booking reminders (customers only): re-sync from Supabase when the app opens and
  // every time it comes back to the foreground, so cancelled/moved bookings are updated.
  const isCustomer = !!session && role !== null && role !== 'creator';
  useEffect(() => {
    if (!isCustomer) return;
    void syncBookingReminders();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncBookingReminders();
    });
    return () => sub.remove();
  }, [isCustomer]);

  // Tapping a reminder opens the Calendar tab.
  const openCalendar = () => {
    if (navigationRef.isReady()) navigationRef.navigate('UserTabs', { screen: 'Calendar' });
  };
  useEffect(() => {
    if (!isCustomer) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isBookingReminder(response)) openCalendar();
    });
    return () => sub.remove();
  }, [isCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  // The app was closed and opened by tapping a reminder.
  const handleNavigationReady = () => {
    if (!isCustomer) return;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        // Only a tap from the last few minutes, not an old one from an earlier launch.
        const fresh = response && Date.now() - response.notification.date < 10 * 60 * 1000;
        if (fresh && isBookingReminder(response)) openCalendar();
      })
      .catch(() => {});
  };

  if (loading || !fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName={session && role === 'creator' && !creatorLive ? 'Onboarding' : undefined}
        >
          {!session ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : role === 'creator' ? (
            <Stack.Group>
              <Stack.Screen name="CreatorTabs" component={CreatorTabs} />
              <Stack.Screen name="Onboarding" component={FreelancerOnboarding} options={{ gestureEnabled: false }} />
              <Stack.Screen name="BusinessCreator" component={BusinessCreator} />
              <Stack.Screen name="ServicesAndPrices" component={ServicesAndPrices} />
              <Stack.Screen name="WorkLocations" component={WorkLocations} />
              <Stack.Screen name="Certificates" component={Certificates} />
              <Stack.Screen name="Bookkeeping" component={Bookkeeping} />
              <Stack.Screen name="Insights" component={Insights} />
              <Stack.Screen name="CustomerProfile" component={CustomerProfile} />
              <Stack.Screen name="CalendarCreator" component={CalendarCreator} options={{ headerShown: false }} />
              <Stack.Screen name="ChatRoom" component={ChatRoom} options={{ headerShown: false }} />
              <Stack.Screen name="VendorProfile" component={VendorProfile} options={{ headerShown: false }} />
              <Stack.Screen name="Settings" component={Settings} initialParams={{ role: 'creator' }} />
              <Stack.Screen name="EditAbout" component={AboutEdit} />
              <Stack.Screen name="EditPause" component={PauseEdit} />
              <Stack.Screen name="EditOffers" component={OffersEdit} />
              <Stack.Screen name="EditAccessibility" component={AccessibilityEdit} />
              <Stack.Screen name="EditSchedule" component={ScheduleEdit} />
              <Stack.Screen name="EditBookingRules" component={BookingRulesEdit} />
              <Stack.Screen name="EditNotifications" component={NotificationsEdit} initialParams={{ role: 'creator' }} />
              <Stack.Screen name="FAQ" component={FAQ} />
              <Stack.Screen name="Terms" component={Terms} />
            </Stack.Group>
          ) : (
            <Stack.Group>
              <Stack.Screen name="UserTabs" component={UserTabs} />
              <Stack.Screen name="Settings" component={Settings} initialParams={{ role: 'user' }} />
              <Stack.Screen name="EditNotifications" component={NotificationsEdit} initialParams={{ role: 'user' }} />
              <Stack.Screen name="FAQ" component={FAQ} />
              <Stack.Screen name="Terms" component={Terms} />
              <Stack.Screen name="HowItWorks" component={HowItWorks} />
              <Stack.Screen name="AccountSettings" component={AccountSettings} />
              <Stack.Screen name="ExplorePreferences" component={ExplorePreferences} />
              <Stack.Screen
                name="ChatRoom"
                component={ChatRoom}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="VendorProfile"
                component={VendorProfile}
                options={{ headerShown: false }}
              />
            </Stack.Group>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}