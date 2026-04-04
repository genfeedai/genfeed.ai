import Card from '@ui/card/Card';
import Image from 'next/image';

export default function ContentTestimonials() {
  const testimonials = [
    {
      avatar: 'https://i.pravatar.cc/150?img=1',
      name: '@contentcreator',
      quote:
        "Genfeed.ai has completely transformed my content workflow. I've doubled my posting frequency while cutting my work time in half!",
      role: 'Influencer, 500K followers',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=5',
      name: '@techfounder',

      quote:
        "The AI video generation is mind-blowing. We're creating professional-quality content in minutes that used to take our team days.",
      role: 'Startup CEO',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=10',
      name: '@socialmediaguru',
      quote:
        "After 3 months with Genfeed.ai, our engagement is up 215% and we've gained 50K new followers. The ROI is incredible!",
      role: 'Marketing Director',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=12',
      name: '@ecommercepro',
      quote:
        "Genfeed.ai's scheduling features have been a game-changer for my business. Our products are now consistently showcased across all platforms with minimal effort.",
      role: 'Online Store Owner',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=15',
      name: '@travelinfluencer',
      quote:
        'I can now create stunning travel content from anywhere in the world. The AI understands exactly what my audience wants to see and delivers every time.',
      role: 'Travel Blogger, 250K followers',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=20',
      name: '@fitnesscoach',
      quote:
        'Since using Genfeed.ai, my workout videos get 3x more engagement. The platform knows exactly how to optimize my content for each social network.',
      role: 'Fitness Instructor',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=25',
      name: '@foodblogger',
      quote:
        "The trend detection feature helps me stay ahead of food trends. My recipe videos now regularly go viral thanks to Genfeed.ai's smart recommendations.",
      role: 'Culinary Content Creator',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=30',
      name: '@techreviewer',
      quote:
        'The analytics dashboard gives me insights I never had before. I can see exactly what content performs best and why, helping me grow faster than ever.',
      role: 'Tech Channel, 1M subscribers',
    },
    {
      avatar: 'https://i.pravatar.cc/150?img=35',
      name: '@smallbusiness',
      quote:
        "As a small business, we couldn't afford a marketing team. Genfeed.ai is like having a full social media department at a fraction of the cost.",
      role: 'Local Business Owner',
    },
  ];

  return (
    <>
      {testimonials.map((testimonial) => (
        <Card key={testimonial.name}>
          <div className="flex items-center mb-4">
            <div className="avatar">
              <div className="w-12 h-12 rounded-full">
                <Image
                  src={testimonial.avatar}
                  alt="User avatar"
                  width={48}
                  height={48}
                  priority
                />
              </div>
            </div>
            <div className="ml-4">
              <h3 className="font-bold">{testimonial.name}</h3>
              <p className="text-sm text-gray-400">{testimonial.role}</p>
            </div>
          </div>
          <p className="text-gray-400">&ldquo;{testimonial.quote}&rdquo;</p>
        </Card>
      ))}
    </>
  );
}
