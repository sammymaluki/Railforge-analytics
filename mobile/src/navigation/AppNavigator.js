import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSelector, useDispatch } from 'react-redux';
import { checkAuthStatus } from '../store/slices/authSlice';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import socketService from '../services/socket/SocketService';
import logger from '../utils/logger';
import { navigationRef } from './NavigationService';

// Screens
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import HomeScreen from '../screens/Home/HomeScreen';
import SearchScreen from '../screens/Search/SearchScreen';
import MapScreen from '../screens/Map/MapScreen';
import MapViewsScreen from '../screens/Map/MapViewsScreen';
import AuthorityScreen from '../screens/Authority/AuthorityScreen';
import PinsScreen from '../screens/Pins/PinsScreen';
import AlertsScreen from '../screens/Alerts/AlertsScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import OfflineScreen from '../screens/Offline/OfflineScreen';
import AuthorityFormScreen from '../screens/Authority/AuthorityFormScreen';
import PinFormScreen from '../screens/Pins/PinFormScreen';
import PinCaptureScreen from '../screens/PinCaptureScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AuthNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const MainTabNavigator = () => {
  const { unreadAlertsCount } = useSelector((state) => state.alerts);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Search':
              iconName = focused ? 'magnify' : 'magnify';
              break;
            case 'Map':
              iconName = focused ? 'map' : 'map-outline';
              break;
            case 'MapViews':
              iconName = focused ? 'map-legend' : 'map-legend';
              break;
            case 'Authority':
              iconName = focused ? 'clipboard-check' : 'clipboard-check-outline';
              break;
            case 'Pins':
              iconName = focused ? 'map-marker' : 'map-marker-outline';
              break;
            case 'Alerts':
              iconName = focused ? 'bell' : 'bell-outline';
              break;
            case 'Settings':
              iconName = focused ? 'cog' : 'cog-outline';
              break;
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#FFD100',
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#333333',
        },
        headerStyle: {
          backgroundColor: '#000000',
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen 
        name="Search" 
        component={SearchScreen} 
        options={{ title: 'Search' }}
      />
      <Tab.Screen 
        name="Map" 
        component={MapScreen} 
        options={{ title: 'Rail Map' }}
      />
      <Tab.Screen 
        name="MapViews" 
        component={MapViewsScreen} 
        options={{ title: 'Map Views' }}
      />
      <Tab.Screen 
        name="Authority" 
        component={AuthorityScreen} 
        options={{ title: 'Authority' }}
      />
      <Tab.Screen 
        name="Pins" 
        component={PinsScreen} 
        options={{ title: 'Pin Drops', headerShown: false }}
      />
      <Tab.Screen 
        name="Alerts" 
        component={AlertsScreen} 
        options={{ 
          title: 'Alerts',
          headerShown: false,
          tabBarBadge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined,
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
};

const MainStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={MainTabNavigator} />
    <Stack.Screen 
      name="AuthorityForm" 
      component={AuthorityFormScreen}
      options={{ 
        headerShown: true,
        title: 'Create Authority',
        headerStyle: {
          backgroundColor: '#000000',
        },
        headerTintColor: '#FFFFFF',
      }}
    />
    <Stack.Screen 
      name="PinForm" 
      component={PinFormScreen}
      options={{ 
        headerShown: true,
        title: 'Drop a Pin',
        headerStyle: {
          backgroundColor: '#000000',
        },
        headerTintColor: '#FFFFFF',
      }}
    />
    <Stack.Screen 
      name="PinCapture" 
      component={PinCaptureScreen}
      options={{ 
        headerShown: true,
        title: 'Capture Pin',
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: '#FFFFFF'
      }}
    />
    <Stack.Screen 
      name="Offline" 
      component={OfflineScreen}
      options={{ 
        headerShown: true,
        title: 'Offline Data',
        headerStyle: {
          backgroundColor: '#000000',
        },
        headerTintColor: '#FFFFFF',
      }}
    />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, isLoading } = useSelector((state) => state.auth);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      await dispatch(checkAuthStatus());
      setIsCheckingAuth(false);
    };

    initializeAuth();
  }, [dispatch]);

  // Connect socket when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      logger.info('Socket', 'User authenticated, connecting to server...');
      socketService.connect().catch(error => {
        logger.error('Socket', 'Failed to connect to server', error);
      });

      const reconnectInterval = setInterval(() => {
        if (!socketService.isConnected()) {
          socketService.connect().catch((error) => {
            logger.warn('Socket', 'Reconnect attempt failed', error);
          });
        }
      }, 10000);

      return () => clearInterval(reconnectInterval);
    } else {
      // Disconnect socket when user logs out
      socketService.disconnect();
    }
  }, [isAuthenticated]);

  if (isCheckingAuth || isLoading) {
    // Show splash screen or loading indicator
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {isAuthenticated ? <MainStackNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default AppNavigator;
