rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null &&
        exists(
          /databases/$(database)/documents/admins/$(request.auth.uid)
        );
    }

    match /events/{eventId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /registrations/{registrationId} {
      allow create: if
        request.resource.data.eventId is string &&
        request.resource.data.eventTitle is string &&
        request.resource.data.username is string &&
        request.resource.data.phone is string &&
        request.resource.data.status == "pending";

      allow read, update, delete: if isAdmin();
    }

    match /admins/{adminId} {
      allow read: if isAdmin();
      allow write: if false;
    }
  }
}
