# Sprint 4 Report

As the final moments of the hackathon approached, we ran final diagnostics on the software to inspect and resolve the missing parts of its code.

## Improvements
- The notification system was not working properly. We investigated and found that we were using the wrong relay address. To fix this issue, we created a custom relay on Cloudflare and updated the software's relay address. With this improvement, it now works.
- The reminder settings were not working either. We found that they had the same problem as the notification system, so we created another custom relay on Cloudflare and updated the software's relay address. With this improvement, they now work.
- The relay for the NASA OSDR Live Catalogue had not been entered because it had not been created. We fixed it the same way as the other two problems, by connecting it to Cloudflare. As a result, our software is now connected to three different worker relays on Cloudflare.
- Some of the indicators were also not working. With the help of Claude AI, we fixed the problem and uploaded the changes to our GitHub repository.

## Additional
- We added another tab named "Reviewer view" for flight surgeons and reviewers. Our software's algorithm flags each user's organ status as green, yellow or red, so that the astronaut's organs can be checked and treated by the flight surgeon. All values in our software are prototype values that have not been reviewed by a medical professional.
- We added a short introduction to the program so that users know their first steps.

## The Project's Demonstration
With the final version of our software fully developed and ready, we started writing our demonstration using Canva. We also made a demo video showing how the software works.
